# LogFlow 设计文档

> 本文档是与产品负责人（用户）讨论确认后的完整设计，是开发的唯一事实来源。
> 开发前请通读本文档 + `NOTES.md`（开发注意事项），按 `MILESTONES.md` 的顺序实施。
> 讨论确认日期：2026-11-01

---

## 1. 需求概述

**痛点**：用户有很多飞书打卡/记录文档，但只想通过**一个输入口**告诉 AI"今天干了啥"，由 AI 自动拆解、分类、写入对应文档。

**核心链路**：

```
用户输入一段话（支持 TODO/Done 标记符，也可纯文本）
  → DeepSeek 拆解为条目 + 判断每条 TODO/Done
  → 按各文档的「关键词规则 + 对话配置」为每条选择归属文档（唯一归属，最匹配）
  → 用户预览确认（可编辑）
  → 写入飞书文档，定位到 月(H1) → 周(H2) → 天(H3) 层级下的当天区块
  → 本地 SQLite 留档 → 看板展示
```

**已确认的产品决策**：

| 决策点 | 结论 |
|---|---|
| 产品形态 | 本地 Web 应用（浏览器访问本地服务） |
| 文档存储 | 飞书云文档（飞书开放平台 API） |
| LLM | DeepSeek API（用户提供 key） |
| 分类规则 | 每个文档可配「关键词规则」+「对话配置」，**两者至少有一个** |
| 分类决策 | 无对话配置的文档 → 纯关键词匹配；有对话配置的文档 → 对话配置+关键词一起交给 DeepSeek 决策 |
| TODO/Done 区分 | 有标记符按标记符（`- [ ]` / `- [x]`）；无标记符由 AI 语义判断 |
| 一条内容命中多文档 | 只写**最匹配的一个** |
| 完全不匹配 | 写入配置中指定的**默认文档**（未设置默认文档则该条标记"待处理"，输入页提示手动归类） |
| 时间组织 | 飞书文档内按 月(H1) → 周(H2) → 天(H3) 层级 |
| 写入前确认 | 拆解结果先预览，用户确认后写入 |
| 事后修正 | 历史记录中可修改条目的文本/状态/归属文档，同步更新飞书 |

---

## 2. 总体架构

```
┌─────────────────────────── 浏览器 ───────────────────────────┐
│  React SPA（输入页 / 看板页 / 配置页 / 历史页）                 │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP /api/*
┌──────────────────────────────▼───────────────────────────────┐
│  后端 Node.js + TypeScript（本地服务，仅监听 127.0.0.1）        │
│  ┌────────────┐ ┌─────────────┐ ┌──────────┐ ┌────────────┐  │
│  │ classify.ts │ │ deepseek.ts │ │ feishu.ts │ │  routes/   │  │
│  │ 分类引擎     │ │ DeepSeek 封装│ │ 飞书封装  │ │  API 路由   │  │
│  └────────────┘ └─────────────┘ └──────────┘ └────────────┘  │
│                          │ db.ts                              │
└──────────────┬───────────┴───────────────────────────────────┘
               │
   ┌───────────▼──────────┐   ┌────────────────┐   ┌──────────────┐
   │ SQLite（data/*.db）   │   │ DeepSeek API   │   │ 飞书开放平台  │
   │ 配置 + 记录索引        │   │ (OpenAI 兼容)  │   │ (docx API)   │
   └──────────────────────┘   └────────────────┘   └──────────────┘
```

**关键设计原则**：飞书文档是"人类可读的存档"；本地 SQLite 是"机器可查的索引"。看板、历史、修正全部基于本地索引，不依赖实时读取飞书。

---

## 3. 技术栈与目录结构

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + Vite + TypeScript + Ant Design 5 | AntD 提供表格/表单/日期选择等成熟组件，开发效率高 |
| 后端 | Node.js 20+ + TypeScript + Express | 单进程本地服务 |
| 数据库 | better-sqlite3 | 同步 API 简单可靠，有预编译二进制 |
| DeepSeek | `openai` npm 包（baseURL 指向 DeepSeek） | 接口兼容 OpenAI |
| 飞书 | `@larksuiteoapi/node-sdk`（官方 SDK） | 封装 token 获取与 API 调用 |

```
LogFlow/
├── server/                        # 后端
│   ├── src/
│   │   ├── index.ts               # 入口：Express + 路由挂载，监听 127.0.0.1:3210
│   │   ├── db.ts                  # better-sqlite3 初始化 + schema 迁移
│   │   ├── config.ts              # 环境变量与 settings 表读取
│   │   ├── deepseek.ts            # DeepSeek 封装（拆解、归属打分、JSON 解析重试）
│   │   ├── classify.ts            # 分类引擎（关键词 + 对话配置 + 默认兜底）
│   │   ├── feishu.ts              # 飞书封装（token 缓存、块树读写、月周天定位）
│   │   └── routes/
│   │       ├── inputs.ts          # 输入/预览/确认/历史/修正
│   │       ├── documents.ts       # 文档 CRUD + 规则 + 对话配置 + 测试分类
│   │       ├── kanban.ts          # 看板聚合
│   │       └── settings.ts        # 凭证设置 + 健康检查
│   ├── .env.example               # DEEPSEEK_API_KEY / FEISHU_APP_ID / FEISHU_APP_SECRET
│   └── package.json
├── web/                           # 前端
│   ├── src/
│   │   ├── api.ts                 # 统一 fetch 封装
│   │   ├── App.tsx                # 路由：/ 输入页、/kanban 看板、/config 配置、/history 历史
│   │   ├── pages/
│   │   │   ├── InputPage.tsx      # 输入 + 拆解预览 + 确认写入
│   │   │   ├── KanbanPage.tsx     # 总览 + 板块详情
│   │   │   ├── ConfigPage.tsx     # 文档管理 + 规则/对话配置 + 测试分类 + 设置
│   │   │   └── HistoryPage.tsx    # 历史输入 + 条目修正
│   │   └── types.ts               # 与后端对齐的 TS 类型
│   ├── vite.config.ts             # dev 代理 /api → http://127.0.0.1:3210
│   └── package.json
├── docs/                          # 本文档目录
│   ├── DESIGN.md
│   ├── MILESTONES.md
│   └── NOTES.md
├── data/                          # 运行时生成：SQLite 数据库（gitignore）
└── AGENTS.md                      # 给 Cursor AI 的上下文规则
```

- 后端端口 **3210**，前端 dev 端口 **5173**（Vite 默认），前端通过 proxy 转发 `/api`。
- 生产模式：后端可直接静态托管 `web/dist`（M4 再考虑，开发期以 dev 双进程为主）。

---

## 4. 数据模型（SQLite）

```sql
-- 目标文档（= 看板中的板块）
CREATE TABLE documents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,              -- 文档显示名，如「工作日志」
  feishu_doc_id  TEXT NOT NULL,              -- 飞书文档 ID（docx）
  is_default     INTEGER NOT NULL DEFAULT 0, -- 是否默认兜底文档（全局唯一）
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 关键词规则（一个文档可有多条规则，每条规则含一组关键词）
CREATE TABLE doc_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  keywords    TEXT NOT NULL,                 -- JSON 数组：["健身","跑步","运动"]
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 对话配置（一个文档至多一条；自然语言描述该文档的收录范围）
CREATE TABLE doc_prompts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  prompt      TEXT NOT NULL,                 -- 如「与技术开发、写代码相关的工作内容」
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 每次提交的原始输入
CREATE TABLE inputs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_text   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending', -- pending=已预览未确认 / written=已写入
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 拆解后的条目（看板/历史/修正的数据源）
CREATE TABLE entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  input_id    INTEGER NOT NULL REFERENCES inputs(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL,                  -- 'todo' | 'done'
  document_id INTEGER REFERENCES documents(id),  -- 预览未确认或待处理时为 NULL
  block_id    TEXT,                           -- 写入飞书后的块 ID（修正/移动时用）
  day_key     TEXT,                           -- 'YYYY-MM-DD'（写入日期，看板过滤用）
  week_key    TEXT,                           -- ISO 周 'YYYY-Www'（看板过滤用）
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 全局设置（凭证等；凭证同时支持 .env 覆盖）
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**设计说明**：
- 预览阶段：`inputs.status='pending'`，entries 已生成（含 AI 建议的 `document_id`）但不落飞书。用户确认时批量写入，更新 status 与 block_id。
- 待处理：AI 无法归类且未配置默认文档 → 该条 `document_id=NULL`，输入页标红提示用户手动选择；用户可选择后随确认一起写入。
- 时间键：`day_key` 用本地时区 `YYYY-MM-DD`；`week_key` 用 ISO 周（周一起始），格式如 `2026-W44`。月过滤直接用 `day_key` 前缀 `YYYY-MM`。写入飞书的标题格式与之一致（见 §7）。

---

## 5. 后端 API 设计

统一前缀 `/api`，JSON 收发。错误统一 `{ "error": "消息" }` + 4xx/5xx。

### 5.1 输入与确认

```
POST /api/inputs
  body: { text: string }
  行为：DeepSeek 拆解 + 分类，落库 inputs(status=pending) + entries（含建议归属），不写飞书
  resp: {
    input_id: number,
    entries: [
      { id, text, status: 'todo'|'done',
        document_id: number|null,          // null = 待处理
        document_name: string|null,
        confidence: number }                // 0~1，供前端展示
    ]
  }

POST /api/inputs/:id/confirm
  body: { entries: [{ id, text, status, document_id }] }   // 用户编辑后的最终版本
  行为：逐条写入飞书（月周天定位），更新 entries 的 block_id/day_key/week_key，
        inputs.status='written'。document_id 为 null 的条目拒绝写入并报错。
  resp: { results: [{ id, block_id }] }

GET /api/inputs?page=1&page_size=20        // 历史列表，按时间倒序
GET /api/inputs/:id                         // 详情：raw_text + entries（含归属）
```

### 5.2 历史修正

```
PATCH /api/entries/:id
  body: { text?, status?, document_id? }
  行为（同步飞书）：
    - 改 text/status：更新原 block（PATCH block 内容 / todo done 属性）
    - 改 document_id：从原文档删除原 block，写入新文档当天区块，更新 block_id
    - 待处理条目（block_id 为 NULL）修改 document_id：直接写入
  resp: { id, block_id, day_key, week_key }
```

### 5.3 文档配置

```
GET    /api/documents                → 文档列表（含每个文档的 keywords 聚合、prompt、is_default）
POST   /api/documents                { name, feishu_doc_id, is_default }
                                      校验：name/feishu_doc_id 必填；is_default 唯一（新设默认时自动取消旧的）
PATCH  /api/documents/:id            { name?, feishu_doc_id?, is_default? }
DELETE /api/documents/:id            级联删除 rules/prompts；已有关联 entries 的 document_id 置 NULL
GET    /api/documents/:id/config     → { keywords: string[], prompt: string|null }
PUT    /api/documents/:id/config     { keywords: string[], prompt: string|null }
                                      校验：keywords 非空或 prompt 非空（至少一项），prompt 为空字符串视为未设置
```

### 5.4 测试分类（配置页调试用，不落库）

```
POST /api/test-classify
  body: { text: string }
  行为：走完整拆解+分类流程，但不写库不写飞书
  resp: { entries: [{ text, status, document_name|null, confidence, matched_keywords: string[] }] }
```

### 5.5 看板

```
GET /api/kanban/overview?range=today|week|month|custom&start=YYYY-MM-DD&end=YYYY-MM-DD
  resp: {
    range: { type, start, end },
    documents: [
      { id, name,
        todo_count, done_count,          -- 时间段内
        recent_todos: [entry...],        -- 时间段内 TODO，最多 5 条
        recent_dones: [entry...] }       -- 时间段内 Done，最多 5 条
    ]
  }

GET /api/kanban/documents/:id?range=...&status=todo|done|all
  resp: { document: {...}, entries: [entry...] }   -- 全量列表，按时间倒序
```

- `range=today`：day_key = 今天；`week`：week_key = 本周；`month`：day_key LIKE 'YYYY-MM%'；`custom`：day_key 在 [start, end]。
- entry 序列化统一带 `document_name` 冗余字段，方便前端直接展示。

### 5.6 设置与健康检查

```
GET /api/settings   → { deepseek_key_set: boolean, feishu_configured: boolean,
                        deepseek_key?: 'sk-****'（掩码）, feishu_app_id?: string }
PUT /api/settings   { deepseek_api_key?, feishu_app_id?, feishu_app_secret? }
                    行为：写入 settings 表（存本地）。留空的字段不更新。
GET /api/health     → 各凭证是否配置 + 连通性（可选：真实 ping DeepSeek / 飞书 token）
```

**凭证优先级**：`.env` 中的值优先于 settings 表（便于开发调试）；生产实际只填 settings 表即可。secret 类字段不通过 GET 明文返回。

---

## 6. 分类引擎（核心，classify.ts）

### 6.1 第一步：拆解（DeepSeek）

输入原始文本，一次调用输出全部条目：

```
系统提示：你是个人工作日志助手。将用户输入拆解为独立条目（每条一句话，保留原意，
不要扩写），并判断每条的状态：
  - 输入含 "- [ ] xxx" → 该条为 todo（文本去掉标记符）
  - 输入含 "- [x] xxx" → 该条为 done（文本去掉标记符）
  - 无标记符 → 语义判断：计划/未完成/未来要做 → todo；已完成的事实 → done
输出严格 JSON：{"entries":[{"text":"...","status":"todo"}]}
```

- 参数：`model: deepseek-chat`，`temperature: 0.1`，`response_format: { type: "json_object" }`（prompt 中已含 "JSON" 字样，满足 DeepSeek 要求）
- 兜底：JSON 解析失败重试一次；仍失败则该整段作为单条 done，交给人确认

### 6.2 第二步：归属打分

对每条条目，确定唯一归属文档。**遵循用户定的双轨制规则**：

```
1. 本地关键词预筛（全部文档）：
   遍历每个文档的全部 keywords，统计该条目命中的关键词数 hit_count。
   纯关键词得分 kw_score = min(1, hit_count / 3)   （命中 3 个以上视为满分）

2. DeepSeek 综合打分（仅「有对话配置」的文档参与）：
   一次调用处理整批条目 × 所有有对话配置的文档：
     系统提示：你是分类助手。以下每个文档有：名称、对话配置（收录范围描述）、
     关键词列表。请为每条输入内容判断与每个文档的匹配度（0~1）。
     对话配置是首要依据，关键词是参考线索，两者结合判断。
     内容若明确属于某文档主题给高分，无关给 0。没有明显归属时全部给低分。
     输出严格 JSON：
     {"assignments":[{"entry_index":0,"scores":{"<document_id>":0.9}}]}
   （document_id 必须使用输入中给出的真实数字 ID，不得编造）

3. 汇总得分：
   - 有对话配置的文档：用 LLM 得分（已综合了关键词）
   - 无对话配置的文档：用 kw_score

4. 决策（唯一归属）：
   - 最高分 >= 0.5 → 归属该文档
   - 最高分 < 0.5 → 默认文档（若无默认文档 → 待处理，document_id=NULL）
```

**实现注意**：
- 归属打分的 LLM 调用按"一次输入产生的整批条目"批量进行，减少调用次数与成本
- 所有文档都无对话配置时，跳过 LLM 调用，纯关键词决策
- 所有条目均无任何命中时，不调 LLM，直接全部走默认/待处理
- LLM 返回的 document_id 不在当前文档集合中 → 视为无效，该文档得分 0
- `confidence` 返回给前端 = 最终得分（纯关键词的条目 confidence = kw_score）

### 6.3 输入示例

配置：
- 文档A「工作日志」：keywords=[工作, 开发, 会议]，prompt="与技术开发、项目协作相关的工作内容"
- 文档B「健身打卡」：keywords=[健身, 跑步]，无 prompt
- 文档C「读书笔记」：keywords=[读书, 阅读]，无 prompt
- 文档D「生活随笔」：无 keywords，prompt="日常生活记录，如做饭、出行、娱乐"
- 默认文档 = 文档A

输入：`上午写了登录接口，下午开会讨论了排期。晚上跑了 5 公里。明天要写单元测试。`

预期：
1. 拆解 4 条：写登录接口(done)、开会讨论排期(done)、跑5公里(done)、写单元测试(todo)
2. 前两条：文档A 高分（对话配置+关键词双命中）→ A；跑5公里：文档B 关键词命中 → B；写单元测试：A（关键词"开发"）→ A
3. 全部有归属，无需默认兜底

---

## 7. 飞书文档写入（feishu.ts）

### 7.1 时间层级结构

每个目标飞书文档内维护三级标题树：

```
H1: 2026年11月
  H2: 第44周 (10-26 ~ 11-01)
    H3: 11-01 周日
      ☑ 上午写了登录接口          ← todo 块, done=true
      ☐ 写单元测试                ← todo 块, done=false
```

- H1 标题：`YYYY年M月`
- H2 标题：`第W周 (MM-DD ~ MM-DD)`，W 为 ISO 周号，括号内为该周周一~周日
- H3 标题：`MM-DD 周X`（中文星期：周一~周日）
- 条目块：统一用**待办块（todo block）**，`done` 属性由条目状态决定——保证看板/文档中 TODO 与 Done 一眼可辨

### 7.2 写入流程（appendEntry）

```
1. 获取文档块树（GET blocks，处理分页，递归整理出块 ID 与层级）
2. 在根下查找 H1 文本 == 本月标题；不存在 → 在根下创建
3. 在 H1 下查找 H2 文本 == 本周标题；不存在 → 在 H2 所属父节点下创建
4. 在 H2 下查找 H3 文本 == 今天标题；不存在 → 在 H3 所属父节点下创建
5. 在 H3 下创建 todo 块（done = status==='done'，elements 为条目文本）
6. 返回新块 block_id（存 entries.block_id）
```

- 匹配标题用**文本精确前缀匹配**（防止把"2026年11月"错配到"2026年11月目标"之类）
- 创建块用 `POST /docx/v1/documents/{doc_id}/blocks/{parent_block_id}/children`（在文档根下创建时 parent_block_id 用 document_id）
- 批量写入时按顺序逐个创建（飞书块 API 无事务，失败重试单个即可）

### 7.3 修正时的移动（moveEntry）

- 改归属：`DELETE batch_delete` 删除原块 → 在新文档走 appendEntry → 更新 entries.block_id
- 改文本/状态：`PATCH block` 更新内容（todo 块同步更新 done 属性）
- 若原块已被人工删除（404）→ 容错：当作无原块，直接在新位置创建，记录日志即可

---

## 8. 看板（数据来自本地索引）

- **总览页**：时间段切换（今天 / 本周 / 本月 / 自定义区间，默认本周）；每个文档一张卡片：文档名、时间段内 todo_count / done_count、最近条目预览；点击进入板块详情
- **板块详情**：时间筛选同上 + 状态筛选（TODO / Done / 全部）；条目列表按时间倒序；显示每条文本、日期、状态
- 纯 SQL 聚合（按 day_key / week_key 过滤），不调飞书，秒开
- 空状态：无文档时引导去配置页创建

---

## 9. 历史与修正

- **历史页**：inputs 倒序列表（时间、原文摘要、条目数、状态徽标 pending/written）；点击打开详情抽屉
- **详情抽屉**：原始文本 + 条目表格；每条可编辑：文本（Input）、状态（Select todo/done）、归属文档（Select 全部文档，含"待处理"）
- **保存**：批量 PATCH entries → 同步飞书（移动/更新块），显示每条同步结果（成功/失败原因）
- 修正不改变 inputs 原文，只改 entries

---

## 10. 前端页面

统一布局：左侧导航（输入 / 看板 / 配置 / 历史），中文界面，Ant Design 5。

### 输入页（首页）
1. 顶部大输入框（TextArea，占位示例提示支持 `- [ ]`/`- [x]` 标记符）
2. "拆解分类"按钮 → 调 `POST /api/inputs` → 展示预览表格：
   - 列：条目文本（可编辑 Input）、状态（Select todo/done）、目标文档（Select）、置信度（Tag）
   - `document_id=NULL` 的待处理条目标红，必须手动选择文档才能确认
3. "确认写入"按钮 → `POST /api/inputs/:id/confirm` → 结果消息（成功 N 条 / 失败原因）
4. 快捷入口：最近一次输入记录

### 看板页
见 §8。

### 配置页（三个 Tab）
- **文档管理**：表格（名称 / 飞书文档 ID / 默认文档徽标 / 关键词 Tags / 对话配置摘要 / 操作）；新建/编辑弹窗：
  - 名称、飞书文档 ID（或文档链接，前端解析出 ID）、默认文档 Switch
  - 关键词 Tags 输入（回车添加，可多条规则合并展示为 tag 列表）
  - 对话配置 TextArea
  - 校验：关键词与对话配置**至少一项非空**；默认文档全局唯一
- **测试分类**：输入框 → 调 `/api/test-classify` → 展示每条条目命中结果（含 matched_keywords），用于调规则
- **设置**：DeepSeek API key（Password 输入框）、飞书 app_id / app_secret、保存到 `/api/settings`；显示 `/api/health` 连通状态

### 历史页
见 §9。

---

## 11. 配置与凭证

| 项 | 位置 | 说明 |
|---|---|---|
| DEEPSEEK_API_KEY | settings 表（或 .env） | `sk-...` |
| FEISHU_APP_ID / FEISHU_APP_SECRET | settings 表（或 .env） | 飞书企业自建应用凭证 |
| 默认文档 | documents.is_default | 配置页指定 |
| 目标文档 | documents 表 | 用户已有的飞书文档，需在飞书中将应用加为协作者 |

首次使用流程：配置页填凭证 → 健康检查通过 → 新建目标文档（粘贴飞书文档链接）→ 配规则/对话配置 → 测试分类 → 日常使用输入页。
