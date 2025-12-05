#!/usr/bin/env node
/**
 * PM-Dev Translator CLI
 * Translates between product and engineering viewpoints using OpenRouter.
 * Requirements: Node 18+ with global fetch support and an OPENROUTER_API_KEY env var.
 */

const { stdout, stderr } = process;
const fs = require('fs');
const path = require('path');

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'tngtech/deepseek-r1t2-chimera:free';

const directionPresets = {
  'pm-to-dev': {
    label: '产品 → 开发',
    userInstruction: (input) => (
      `你是资深架构师，负责把产品语言拆成可落地的技术方案。\n` +
      `输入（产品原话）：\n${input}\n\n` +
      `请用中文输出：\n` +
      `- 需求目标与背景（20字内）\n` +
      `- 技术拆解：候选算法/方案、数据来源与处理、接口/存储/基础设施、实时性与性能指标\n` +
      `- 边界与风险：缺失信息、潜在瓶颈、依赖项\n` +
      `- 粗略人日/工作量估计（明确假设）\n` +
      `- 建议的澄清问题（2-3条）\n` +
      `要求：主动补全合理假设，条理清晰，避免空话。`
    ),
  },
  'dev-to-pm': {
    label: '开发 → 产品',
    userInstruction: (input) => (
      `你是产品沟通官，把技术方案转成业务语言。\n` +
      `输入（技术表述）：\n${input}\n\n` +
      `请用中文输出：\n` +
      `- 业务价值：对用户体验/指标的具体提升\n` +
      `- 适用范围与限制（平台、流量、数据前提）\n` +
      `- 成本与风险：人力/资源/潜在影响\n` +
      `- 可量化的验证指标（2-3个）\n` +
      `- 下一步建议或需要的产品决策（2-3条）\n` +
      `要求：少用行话，面向业务决策者，保持简洁。`
    ),
  },
};

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  });
}

function normalizeDirection(input) {
  if (!input) return null;
  const text = input.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const compact = lower.replace(/\s+/g, '');

  // Quick numeric shortcuts
  if (['1', '①', '一', '1)', '1.', 'a'].includes(compact)) return 'pm-to-dev';
  if (['2', '②', '二', '2)', '2.', 'b'].includes(compact)) return 'dev-to-pm';

  // Canonical keywords
  if (/(^|\/)(pm-to-dev)(\/|$)/.test(compact) || /(pm2dev|p2d)/.test(compact)) return 'pm-to-dev';
  if (/(^|\/)(dev-to-pm)(\/|$)/.test(compact) || /(dev2pm|d2p)/.test(compact)) return 'dev-to-pm';

  // Generic regex-based detection
  const pmWords = /(产品|产品经理|pm|product manager|product)/i;
  const devWords = /(开发|研发|工程师|工程|dev|engineer)/i;
  const pmToDevPattern = /(产品|product|pm)[^a-z0-9\u4e00-\u9fa5]*(到|->|→|to)?[^a-z0-9\u4e00-\u9fa5]*(开发|研发|工程|dev|engineer)/i;
  const devToPmPattern = /(开发|研发|工程|dev|engineer)[^a-z0-9\u4e00-\u9fa5]*(到|->|→|to)?[^a-z0-9\u4e00-\u9fa5]*(产品|product|pm)/i;

  if (pmToDevPattern.test(lower)) return 'pm-to-dev';
  if (devToPmPattern.test(lower)) return 'dev-to-pm';

  // Position heuristic if both appear
  const pmPos = lower.search(pmWords);
  const devPos = lower.search(devWords);
  if (pmPos !== -1 && devPos === -1) return 'pm-to-dev';
  if (devPos !== -1 && pmPos === -1) return 'dev-to-pm';
  if (pmPos !== -1 && devPos !== -1) return pmPos < devPos ? 'pm-to-dev' : 'dev-to-pm';

  return null;
}

async function promptDirection(rl) {
  const hint = '选择翻译方向: 1) 产品→开发  2) 开发→产品\n' +
    '支持: pm-to-dev / dev-to-pm / 产品到开发 / 开发到产品 / 产品to开发 / 开发to产品\n';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const answer = await ask(rl, hint);
    const dir = normalizeDirection(answer);
    if (dir) return dir;
    stdout.write('未识别的方向，请重新输入。例如 1 或 pm-to-dev 或 产品到开发。\n');
  }
}

function buildMessages(direction, userContent) {
  const preset = directionPresets[direction];
  if (!preset) throw new Error('Unknown direction');

  const systemPrompt = [
    '你是双语沟通翻译助手，能在产品经理和开发工程师之间做上下文精确转换。',
    '输出要结构化、可执行，必要时补充缺失信息并点出假设。',
    '优先使用中文表述，保留必要的技术术语但避免堆砌行话。'
  ].join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: preset.userInstruction(userContent) },
  ];
}

async function streamCompletion(messages, apiKey) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost/pm-dev-translator',
      'X-Title': 'PM-Dev-Translator CLI',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.35,
      stream: true,
    }),
  });

  if (!resp.ok || !resp.body) {
    const detail = await safeReadText(resp);
    const friendly = buildFriendlyError(resp.status, detail);
    throw new Error(friendly);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      handleEvent(rawEvent);
      boundary = buffer.indexOf('\n\n');
    }
  }

  // Process any trailing data
  if (buffer.trim()) handleEvent(buffer.trim());
  stdout.write('\n');
  return fullText;

  function handleEvent(event) {
    if (!event.startsWith('data:')) return;
    const data = event.replace(/^data:\s*/, '');
    if (data === '[DONE]') return;
    try {
      const json = JSON.parse(data);
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        const cleaned = cleanText(delta);
        stdout.write(cleaned);
        fullText += cleaned;
      }
    } catch (_) {
      // ignore parse errors for partial chunks
    }
  }
}

async function safeReadText(resp) {
  try {
    return await resp.text();
  } catch (e) {
    return '';
  }
}

function buildFriendlyError(status, detail) {
  const base = detail || '';
  if (status === 401) return '鉴权失败：请检查 OPENROUTER_API_KEY 是否正确/未过期。';
  if (status === 429) return '请求过多或限流：请稍候再试，或降低请求频率。';
  if (status >= 500) return `服务端异常(${status})：可稍后重试。${base}`;
  return `API 请求失败(${status})：${base}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--direction' || arg === '-d') {
      result.direction = args[i + 1];
      i += 1;
    } else if (arg === '--text' || arg === '-t') {
      result.text = args[i + 1];
      i += 1;
    }
  }
  return result;
}

function createReadline() {
  const readline = require('readline');
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function cleanText(text) {
  if (!text) return '';
  let result = text;
  // Replace HTML breaks with newline
  result = result.replace(/<br\s*\/?>/gi, '\n');
  // Strip markdown bold markers
  result = result.replace(/\*\*(.*?)\*\*/g, '$1');
  // Strip italic markers with underscores
  result = result.replace(/_([^_]+)_/g, '$1');
  // Strip heading markers at line start (### ... -> ...)
  result = result.replace(/^[#]{1,6}\s*/gm, '');
  // Strip inline code fences/backticks
  result = result.replace(/`{1,3}([^`]*)`{1,3}/g, '$1');
  // Normalize bullet markers: remove leading *, -, +, •
  result = result.replace(/^[\s]*[-*+•]\s*/gm, '');
  // Remove ordered list markers like "1. " or "2) "
  result = result.replace(/^[\s]*\d+[\.\)]\s*/gm, '');
  return result;
}

async function main() {
  loadLocalEnv();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    stderr.write('请先设置环境变量 OPENROUTER_API_KEY。\n');
    process.exit(1);
  }

  const args = parseArgs();
  let direction = normalizeDirection(args.direction);
  let userText = args.text;
  const interactive = !direction || !userText;
  const rl = interactive ? createReadline() : null;

  try {
    let continueFlag = true;
    while (continueFlag) {
      try {
        if (!direction && rl) {
          direction = await promptDirection(rl);
        }
        if (!direction) {
          throw new Error('未识别的翻译方向，请使用 pm-to-dev 或 dev-to-pm');
        }

        if (!userText && rl) {
          userText = await ask(rl, '输入需要翻译的内容：\n');
          while (!userText || !userText.trim()) {
            stdout.write('内容不能为空，请重新输入。\n');
            userText = await ask(rl, '输入需要翻译的内容：\n');
          }
        }
        if (!userText) {
          throw new Error('未提供待翻译内容');
        }

        const preset = directionPresets[direction];
        stdout.write(`\n方向：${preset.label}\n模型：${MODEL}\n正在生成（流式输出）...\n\n`);
        const messages = buildMessages(direction, userText.trim());
        await streamCompletion(messages, apiKey);
      } catch (err) {
        stderr.write(`\n错误：${err.message}\n`);
        if (!interactive) {
          process.exitCode = 1;
          break;
        }
      }

      if (!interactive) break;

      const again = await ask(rl, '\n按回车继续，输入 q 退出：');
      if (again && again.trim().toLowerCase().startsWith('q')) {
        continueFlag = false;
      } else {
        // reset for next round
        direction = null;
        userText = null;
      }
    }
  } finally {
    if (rl) rl.close();
  }
}

main();
