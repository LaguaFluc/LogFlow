# LogFlow 项目规则（给 AI 开发助手）

## 项目是什么

LogFlow：本地 Web 应用。用户通过**一个输入口**告诉 AI"今天干了啥"，AI（DeepSeek）自动拆解为条目、判断 TODO/Done、按各文档的「关键词规则 + 对话配置」分类，用户确认后写入**飞书文档**（按 月→周→天 标题层级组织），并提供看板总览。

## 开发前必读

按顺序阅读以下文档，它们是开发的唯一事实来源：

1. `docs/DESIGN.md` — 完整设计：数据模型、API、分类引擎算法、飞书写入逻辑、页面设计
2. `docs/MILESTONES.md` — 开发计划：按 M1 → M2 → M3 → M4 顺序实施，每个任务有验收标准
3. `docs/NOTES.md` — 开发注意事项：飞书/DeepSeek API 细节、Mock 模式、常见坑

## 硬性约束

- **技术栈不许换**：后端 Node.js + TypeScript + Express + better-sqlite3；前端 React + Vite + TypeScript + Ant Design 5；飞书用官方 SDK `@larksuiteoapi/node-sdk`；DeepSeek 用 `openai` npm 包（baseURL 指向 DeepSeek）
- **后端只监听 127.0.0.1:3210**，前端 5173 经 Vite proxy 访问 `/api`
- **凭证安全**：API key 存 .env / settings 表，不进 git，日志与 GET 接口必须掩码
- **分类算法必须按 DESIGN.md §6 实现**：无对话配置的文档纯关键词匹配；有对话配置的文档由 LLM 结合对话配置+关键词打分；最高分唯一归属；低于阈值进默认文档；无默认文档则标待处理
- **飞书写入层级**：H1 月 → H2 周 → H3 天 → todo 块条目（done 属性区分勾选），标题文本格式见 DESIGN.md §7
- **每个任务的验收标准必须真的跑过**再进下一个任务，不要攒批
- 不要自行发明文档未提及的功能；有歧义时先停下，在代码里标注 TODO 并向用户确认

## 开发顺序

M1（骨架+配置，无需凭证）→ M2（核心链路，飞书可用 FEISHU_MOCK=1 联调）→ M3（看板）→ M4（历史修正）

## 当前状态

设计已与用户确认（2026-11-01），尚未开始编码。DeepSeek key 与飞书凭证由用户后续在配置页填入。
