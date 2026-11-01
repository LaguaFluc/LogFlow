# LogFlow 开发注意事项

> 开发前必读。记录外部 API 的关键细节、联调步骤与常见坑，避免踩雷返工。

---

## 1. 飞书开放平台

### 1.1 应用准备（用户侧操作，需要用户配合）

1. 在[飞书开放平台](https://open.feishu.cn/)创建**企业自建应用**
2. 获取 `App ID` / `App Secret`（凭证与基础信息页）
3. 权限管理中添加：**云文档 docx 读写权限**（`docx:document`）
4. 创建应用版本并发布（自建应用需发布后权限才生效，企业内部可用）
5. **文档授权**：用户的已有飞书文档需要把该应用加为协作者（在飞书文档右上角"分享"→ 搜索应用名添加，或文档归属的应用管理空间），否则 API 访问 403。应用自己创建的文档天然可访问。
   - 建议做法：应用创建文档 → 把文档分享给用户，后续都往应用创建的文档写。若用户坚持用已有文档，则必须完成文档授权。

### 1.2 认证

- 自建应用用 **tenant_access_token**：`POST /open-apis/auth/v3/tenant_access_token/internal`，body 为 app_id + app_secret
- 有效期约 2 小时，**必须缓存并提前 5 分钟刷新**（内存缓存即可，单进程）
- 官方 Node SDK `@larksuiteoapi/node-sdk` 已封装 token 管理，推荐直接用 SDK 而不是手写 REST

### 1.3 docx 块 API 关键点

官方文档入口：<https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/list>

| 操作 | 接口 | 注意 |
|---|---|---|
| 获取所有块 | `GET /docx/v1/documents/{doc_id}/blocks` | `page_size` 最大 500，返回 `has_more`/`page_token` 需循环拉全；`document_revision_id` 传 `-1` 表示最新 |
| 创建块 | `POST /docx/v1/documents/{doc_id}/blocks/{block_id}/children` | 在文档**根下**创建时 `block_id` 填 document_id 本身；一次最多创建 50 个块 |
| 更新块 | `PATCH /docx/v1/documents/{doc_id}/blocks/{block_id}` | 传 `update_text_elements` 等更新内容；todo 块更新 `todo.style.done` |
| 删除块 | `DELETE /docx/v1/documents/{doc_id}/blocks/{block_id}/children/batch_delete` | body 传 `{ start_index, end_index }`，一次最多删 50 个 |

块类型为数字枚举（创建块时用数字 `block_type`，字段名与块类型同名，如 `block_type: 3` 配 `heading2: {...}`）：

```
1 文本(text)  2~10 标题1~9(heading1~9)  11 无序列表(bullet)  12 有序列表(ordered)
13 代码(code)  14 引用(quote)  16 待办(todo)  17 高亮(callout)
```

> ⚠️ 数字以飞书官方文档为准，开发前先对着官方文档核对一遍枚举再写代码。

- **todo 块**：`{ block_type: 16, todo: { style: { done: true|false }, elements: [{ text_run: { content: "..." } }] } }`
- **标题块**：`{ block_type: 2, heading1: { elements: [{ text_run: { content: "2026年11月" } }] } }`
- 块树是**嵌套结构**：`GET blocks` 返回的 children 里有 `children` 递归嵌套；条目块要创建在 H3 标题块的 children 下，层级才正确
- **标题匹配用文本精确匹配**（H1 `2026年11月` 全等），避免前缀混淆
- 文档块 API 有频率限制：写入多条目时顺序执行，遇到 429 退避重试；不要并发猛发
- 已写入的块记录 block_id（本地 entries 表），修正时才能删除/更新

### 1.4 Mock 模式（无凭证开发必备）

`feishu.ts` 提供 `FEISHU_MOCK=1` 环境变量：所有飞书操作走内存假实现，返回递增假 block_id，并把"文档树"打印到日志便于调试。M2 前端联调完全不需要真实凭证。真实联调时去掉该变量即可。

---

## 2. DeepSeek API

官方文档：<https://api-docs.deepseek.com/zh-cn/>

- **base_url**：`https://api.deepseek.com`（OpenAI 兼容，直接用 `openai` npm 包，改 baseURL 即可）
- **模型**：`deepseek-chat`（V3 系列，够用且便宜；不需要 reasoner）
- **JSON 输出**：`response_format: { type: "json_object" }` 可用，但 **prompt 中必须出现 "json" 一词**（否则报错）。DESIGN.md §6 的 prompt 已满足
- **temperature**：分类任务用 0 ~ 0.3，保证稳定
- JSON 解析兜底：解析失败重试 1 次；仍失败不要静默吞掉，降级为"整段作为单条 done + 待处理"，交给用户预览修正
- 批量原则：拆解一次调用；归属打分按"整批条目 × 全部有对话配置的文档"一次调用（DESIGN.md §6.2），不要逐条调用（成本与延迟都会翻倍）
- 网络错误重试 2 次（指数退避 1s/3s）
- API key 存 settings 表 / .env，**不进 git**；GET /api/settings 只返回掩码

---

## 3. 本地工程

### 3.1 SQLite（better-sqlite3）

- 有预编译二进制，Node 20/22 一般免编译直接装；若安装失败再考虑系统安装 `build-essential python3`
- 数据库文件放 `data/logflow.db`，`data/` 加入 .gitignore
- 建一张 `schema_migrations` 表记录版本，预留迁移机制（M1 就要做，后患少）
- better-sqlite3 是同步 API，单进程本地服务放心用；注意 prepared statement 释放

### 3.2 端口与网络

- 后端**只监听 `127.0.0.1`**（凭证在本地，不要暴露到局域网）
- 后端 3210 / 前端 5173；Vite `server.proxy` 把 `/api` 转发到 3210，前端代码里统一用相对路径 `/api/...`
- CORS 不需要（同源代理）

### 3.3 安全

- `.env`、`data/` 不进 git；提交 `.env.example` 模板
- 所有密钥类字段：GET 接口返回掩码（如 `sk-****xxxx`），日志中打码，报错信息不携带密钥
- 前端表单输入做基本校验；后端做权威校验（keywords/prompt 至少一项等）

### 3.4 时间与周计算

- 统一用**本地时区**（用户在中国，`dayjs` 默认本地时区即可）
- ISO 周：周一起始。`week_key` 格式 `YYYY-Www`（如 `2026-W44`），周标题 `第44周 (10-26 ~ 11-01)`
- 月标题 `2026年11月`；天标题 `11-01 周六`
- 写入与看板过滤共用同一套 `day_key`/`week_key` 生成函数，别写两份逻辑

---

## 4. 联调步骤（凭证到齐后）

1. 用户提供 DeepSeek key + 飞书 App ID/Secret，配置页填入，`/api/health` 全绿
2. 用户把目标飞书文档链接发来 → 配置页新建文档（或用户确认应用创建新文档）
3. 配好一个文档的关键词 + 对话配置 → 测试分类面板验证归属
4. 输入页走一遍真实流程 → 飞书文档核对月/周/天层级与勾选状态
5. 再看板页核对数字

---

## 5. 常见坑速查

| 坑 | 现象 | 解法 |
|---|---|---|
| 文档未授权给应用 | 飞书 API 返回 403 或权限错误 | 文档分享给应用，或改用应用创建的文档 |
| 权限未发布版本 | 有 scope 但调用报无权限 | 开发者后台创建并发布应用版本 |
| tenant token 过期 | 运行 2 小时后突然 401 | token 缓存 + 提前刷新 |
| JSON mode 报错 | DeepSeek 返回 400 | prompt 中必须含 "json" 一词 |
| 块层级错乱 | 条目出现在错误位置 | 确认 parent block_id 是 H3 标题块，而非文档根 |
| 分页没拉全 | 找不到已存在的标题，重复创建 | GET blocks 循环处理 has_more/page_token |
| 429 | 批量写入被限速 | 顺序写入 + 退避重试，控制并发 |
| 用户手工改过文档 | 块 ID 失效（404） | 修正时容错：404 视为块不存在，直接在新位置创建 |
