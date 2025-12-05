# PM-Dev Translator (简版)

一个命令行沟通翻译助手，帮助产品经理和开发工程师快速把彼此的话翻译成对方关心的要点，使用 OpenRouter 的 `tngtech/deepseek-r1t2-chimera:free` 模型并支持流式输出。

## 快速开始

前置：Node.js 18+（自带 `fetch`，本项目无额外依赖，**无需 `npm install`**）。

1) 克隆并进入目录  
   ```bash
   git clone <repo-url> && cd PM-Dev-Translator
   ```
2) 配置 Key（2 选 1）  
   - 临时导出（Windows cmd）：`set OPENROUTER_API_KEY=YOUR_KEY`  
   - 临时导出（PowerShell）：`$env:OPENROUTER_API_KEY="YOUR_KEY"`  
   - 临时导出（macOS/Linux）：`export OPENROUTER_API_KEY=YOUR_KEY`  
   - 或在根目录创建 `.env`：`OPENROUTER_API_KEY=YOUR_KEY`
3) 运行（交互模式）  
   ```bash
   node index.js
   ```
   按提示输入方向和内容，结束后可按回车继续，输入 q 退出。
4) 运行（非交互，示例）  
   ```bash
   node index.js --direction pm-to-dev --text "我们需要一个智能推荐功能,提升用户停留时长"
   ```

> 提醒：`.env` 已在 `.gitignore` 中，避免提交密钥；项目不会记录或上传你的密钥。

## 功能说明

- 方向选择：`pm-to-dev`（产品 → 开发）或 `dev-to-pm`（开发 → 产品）
- 输入原始内容后，实时流式输出翻译结果
- 翻译会主动补全缺失信息并给出澄清问题/业务解读
- 使用 OpenRouter 模型，无额外依赖，开箱即用

## 使用示例

交互模式直接运行 `node index.js`，按提示输入方向和文本。

交互模式方向可输入：
- 直接数字：`1` 表示 产品→开发，`2` 表示 开发→产品
- 英文：`pm-to-dev`、`dev-to-pm`
- 中文/混合：包含“产品/PM/product”与“开发/研发/dev/engineer”以及 “到/->/→/to” 即可自动识别方向，例如 “产品到研发”“开发->产品”“产品 to dev”

非交互模式示例：
```bash
node index.js --direction pm-to-dev --text "我们需要一个智能推荐功能,提升用户停留时长"
```

## 测试用例（示例输出仅供参考）

1) 产品视角输入  
`我们需要一个智能推荐功能,提升用户停留时长`  
预期要点：候选算法（协同过滤/内容/混合）、数据来源与埋点、实时性（秒级/分钟级）、性能指标(QPS/TP99)、粗略人日、澄清问题。

2) 开发视角输入  
`我们优化了数据库查询，QPS提升了30%`  
预期要点：对用户响应时间/稳定性的提升、能支撑的业务峰值、成本/风险、验证指标（RT、错误率、容量）、建议的产品决策或上线节奏。

## 提示词设计思路

- 全局 System：设定为“双语沟通翻译助手”，强调“结构化、可执行、补充缺失信息、中文输出但保留必要技术术语”。
- 产品 → 开发：要求输出 5 个板块——目标背景、技术拆解（算法/数据/接口/性能）、边界风险、粗略人日、澄清问题；鼓励在缺信息时做合理假设。
- 开发 → 产品：要求输出 5 个板块——业务价值、适用范围/限制、成本与风险、量化验证指标、下一步决策建议；强调少用行话、面向业务决策者。

## 配置项

- 环境变量：`OPENROUTER_API_KEY`（必填）
- 模型：`tngtech/deepseek-r1t2-chimera:free`（可在 `index.js` 修改）
- 请求参数：`temperature=0.35`，可视需要调整

## 常见问题

- **报错未设置 Key**：确认已导出/设置 `OPENROUTER_API_KEY`。
- **输出无内容或异常中断**：检查网络或模型限流，可稍后重试。
- **方向输错直接退出？**：交互模式会循环提示方向/内容，输入 q 退出；若用非交互模式，方向必须是 `pm-to-dev` 或 `dev-to-pm`。
- **仍出现 Markdown 符号？**：已做清洗，若少量符号残留属模型内容，可手动忽略或再行清洗。
