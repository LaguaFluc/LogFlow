# LogFlow 开发计划（Milestones）

> 按顺序实施。每个任务完成后必须满足验收标准再进入下一个。
> M1、M2 为当前必做，M3、M4 为后续阶段。技术细节与坑见 `NOTES.md`。

---

## M1：骨架 + 配置能力（无需任何外部凭证即可开发验收）

**目标**：本地服务跑起来，配置页可用，文档/规则/对话配置可增删改查并持久化。

### 任务清单

- [ ] **1.1 项目初始化**
  - 创建 `server/`（Node + TS + Express）与 `web/`（React + Vite + TS + AntD 5）
  - 根目录 dev 启动脚本（如 `npm run dev` 用 concurrently 同时起前后端）
  - 后端监听 `127.0.0.1:3210`；Vite 代理 `/api` → `http://127.0.0.1:3210`
  - `.gitignore`：node_modules、dist、data/、.env
  - 验收：`npm run dev` 后浏览器打开 5173 显示空白 App 壳（导航布局）且 `/api/health` 返回 JSON

- [ ] **1.2 SQLite 与数据层**
  - `db.ts`：better-sqlite3 初始化 `data/logflow.db`，按 DESIGN.md §4 建表（含 schema 版本表，预留迁移）
  - 数据访问函数：documents/rules/prompts/inputs/entries/settings 的 CRUD
  - 验收：重启服务数据不丢

- [ ] **1.3 文档配置 API**
  - `routes/documents.ts`：按 DESIGN.md §5.3 实现
  - 校验：name/feishu_doc_id 必填；关键词与对话配置至少一项；is_default 全局唯一；飞书文档 ID 格式校验（`https://xxx.feishu.cn/docx/XXXX` 链接粘贴时解析出 ID）
  - 验收：curl 全流程 CRUD + 校验生效（非法请求返回明确错误消息）

- [ ] **1.4 设置 API**
  - `routes/settings.ts`：GET/PUT settings（密钥掩码返回），`GET /api/health` 返回凭证配置状态
  - `.env.example` 与凭证优先级逻辑（.env 优先）
  - 验收：写入 key 后 health 反映状态，重启后仍在

- [ ] **1.5 配置页 UI**
  - `ConfigPage.tsx`：文档管理 Tab（表格 + 新建/编辑弹窗 + 删除确认）、设置 Tab（凭证表单 + 健康状态）
  - 关键词 Tag 输入组件；表单校验与后端一致
  - 验收：浏览器操作全流程，刷新后配置保留

**M1 完成标志**：不依赖任何外部 API，配置页完整可用。

---

## M2：核心链路（输入 → DeepSeek 拆解分类 → 飞书写入）

**目标**：一句话输入，AI 拆解分类，确认后写入真实飞书文档的 月/周/天 层级。

### 任务清单

- [ ] **2.1 DeepSeek 封装**
  - `deepseek.ts`：openai SDK 指向 `https://api.deepseek.com`，`deepseek-chat`，temperature 0.1
  - 拆解函数与归属打分函数按 DESIGN.md §6 的 prompt 实现；JSON 解析失败重试 1 次；网络错误重试 2 次（指数退避）
  - 验收：脚本直调拆解函数，混合输入（标记符 + 纯文本）输出条目与状态正确

- [ ] **2.2 飞书封装（可先用 Mock 开发）**
  - `feishu.ts`：tenant_access_token 获取 + 缓存（提前 5 分钟刷新）；块树读取（分页递归）；查找/创建 H1/H2/H3；创建 todo 块；删除块；更新块
  - 提供 `FEISHU_MOCK=1` 环境变量开关：Mock 模式用内存假实现返回假 block_id，便于无凭证联调前端（NOTES.md 有说明）
  - 验收：Mock 模式全流程可跑；真实模式在测试文档中正确生成 月→周→天 层级并追加 todo 块

- [ ] **2.3 分类引擎**
  - `classify.ts`：按 DESIGN.md §6.2 实现双轨打分与默认兜底；批量 LLM 调用；纯关键词路径跳过 LLM
  - 单元级验证：用 §6.3 的示例场景（4 文档配置 + 示例输入）验证归属正确
  - 验收：示例场景归属全部正确；无匹配条目落默认文档/待处理

- [ ] **2.4 预览与确认 API**
  - `routes/inputs.ts`：POST /api/inputs（拆解+分类，落库 pending）、POST /api/inputs/:id/confirm（校验后逐条写飞书、更新 block_id/day_key/week_key、inputs.status=written）
  - confirm 中对单个写入失败：记录失败原因返回给前端，其余继续（部分成功）
  - 验收：curl 全流程；飞书文档中出现当天区块与正确勾选状态的条目

- [ ] **2.5 输入页 UI**
  - `InputPage.tsx`：输入框 → 拆解分类 → 预览表格（可编辑文本/状态/目标文档；待处理标红必选）→ 确认写入 → 结果提示
  - loading 态、空态、错误提示（如未配凭证、未建文档的引导）
  - 验收：浏览器完整走通（Mock 模式即可），预览编辑生效，确认后看板数据源（entries 表）正确

- [ ] **2.6 测试分类面板**
  - `POST /api/test-classify` + 配置页"测试分类"Tab：输入 → 展示每条命中结果与 matched_keywords
  - 验收：调试规则时无需真实写入即可看到归属决策

**M2 完成标志**：真实飞书文档中，输入"今天干了啥"能正确拆解、分类、按时间层级写入；预览可编辑可确认。

---

## M3：看板

- [ ] 3.1 看板聚合 API（§5.5）：时间段过滤（today/week/month/custom）+ 文档分组统计
- [ ] 3.2 看板页：总览卡片 + 板块详情（时间段切换 + 状态筛选 + 列表）
- [ ] 3.3 空状态与加载态完善
- **验收**：写入若干条目后，看板总览与详情数字、列表正确；切换时间段正确过滤

## M4：历史修正与打磨

- [ ] 4.1 历史页：inputs 列表 + 详情抽屉 + 条目编辑（文本/状态/归属）
- [ ] 4.2 修正同步：PATCH /api/entries/:id → 飞书移动/更新块（§5.2、§7.3），含块已被人工删除的容错
- [ ] 4.3 错误处理与日志：统一错误格式、飞书 429 限速重试、本地日志文件
- [ ] 4.4 生产模式：后端静态托管 web/dist，单端口启动（可选）
- **验收**：修正一条条目的归属后，飞书原文档该块消失、新文档当天区块出现该块，看板随之更新

---

## 开发顺序建议（给 Cursor）

1. 先 M1 全部（不依赖凭证，可完全本地验收）
2. M2 先 2.1、2.2（凭证到齐前用 Mock）、2.3 → 2.4 → 2.5 → 2.6
3. 每个任务完成即运行验收，不要跨任务攒一堆再验
