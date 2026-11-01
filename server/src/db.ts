import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const projectRoot = path.resolve(__dirname, '../..');

export type DocumentRow = {
  id: number;
  name: string;
  feishu_doc_id: string;
  is_default: number;
  created_at: string;
};

export type RuleRow = {
  id: number;
  document_id: number;
  keywords: string[];
  created_at: string;
};

export type PromptRow = {
  id: number;
  document_id: number;
  prompt: string;
  created_at: string;
};

export type InputStatus = 'pending' | 'written';

export type InputRow = {
  id: number;
  raw_text: string;
  status: InputStatus;
  created_at: string;
};

export type EntryStatus = 'todo' | 'done';

export type EntryRow = {
  id: number;
  input_id: number;
  text: string;
  status: EntryStatus;
  document_id: number | null;
  block_id: string | null;
  day_key: string | null;
  week_key: string | null;
  created_at: string;
  updated_at: string;
};

type RuleStored = Omit<RuleRow, 'keywords'> & { keywords: string };

const MIGRATION_V1 = `
CREATE TABLE documents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  feishu_doc_id  TEXT NOT NULL,
  is_default     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX idx_documents_one_default ON documents(is_default) WHERE is_default = 1;

CREATE TABLE doc_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  keywords    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE doc_prompts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  prompt      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE inputs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_text   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  input_id    INTEGER NOT NULL REFERENCES inputs(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  block_id    TEXT,
  day_key     TEXT,
  week_key    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let database: Database.Database | null = null;

export function initDb(): Database.Database {
  if (database) return database;
  const dir = path.join(projectRoot, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'logflow.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  database = db;
  return db;
}

export function getDb(): Database.Database {
  if (!database) {
    throw new Error('数据库尚未初始化');
  }
  return database;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined;
  const current = row?.version ?? 0;
  if (current < 1) {
    const apply = db.transaction(() => {
      db.exec(MIGRATION_V1);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
    });
    apply();
  }
}

function parseKeywords(raw: string): string[] {
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('关键词数据损坏');
  }
  return value;
}

function mapRule(row: RuleStored): RuleRow {
  return { ...row, keywords: parseKeywords(row.keywords) };
}

export function listDocuments(): DocumentRow[] {
  return getDb().prepare('SELECT * FROM documents ORDER BY id ASC').all() as DocumentRow[];
}

export function getDocument(id: number): DocumentRow | undefined {
  return getDb().prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow | undefined;
}

export function createDocument(input: {
  name: string;
  feishu_doc_id: string;
  is_default: boolean;
}): DocumentRow {
  const db = getDb();
  const insert = db.transaction(() => {
    if (input.is_default) {
      db.prepare('UPDATE documents SET is_default = 0 WHERE is_default = 1').run();
    }
    const info = db
      .prepare('INSERT INTO documents (name, feishu_doc_id, is_default) VALUES (?, ?, ?)')
      .run(input.name, input.feishu_doc_id, input.is_default ? 1 : 0);
    return getDocument(Number(info.lastInsertRowid)) as DocumentRow;
  });
  return insert();
}

export function updateDocument(
  id: number,
  patch: { name?: string; feishu_doc_id?: string; is_default?: boolean },
): DocumentRow | undefined {
  const existing = getDocument(id);
  if (!existing) return undefined;
  const db = getDb();
  const apply = db.transaction(() => {
    if (patch.is_default === true) {
      db.prepare('UPDATE documents SET is_default = 0 WHERE is_default = 1 AND id != ?').run(id);
    }
    const name = patch.name ?? existing.name;
    const feishuDocId = patch.feishu_doc_id ?? existing.feishu_doc_id;
    const isDefault = patch.is_default === undefined ? existing.is_default : patch.is_default ? 1 : 0;
    db.prepare('UPDATE documents SET name = ?, feishu_doc_id = ?, is_default = ? WHERE id = ?').run(
      name,
      feishuDocId,
      isDefault,
      id,
    );
  });
  apply();
  return getDocument(id);
}

export function deleteDocument(id: number): boolean {
  const info = getDb().prepare('DELETE FROM documents WHERE id = ?').run(id);
  return info.changes > 0;
}

export function listRules(documentId: number): RuleRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM doc_rules WHERE document_id = ? ORDER BY id ASC')
    .all(documentId) as RuleStored[];
  return rows.map(mapRule);
}

export function getRule(id: number): RuleRow | undefined {
  const row = getDb().prepare('SELECT * FROM doc_rules WHERE id = ?').get(id) as RuleStored | undefined;
  return row ? mapRule(row) : undefined;
}

export function createRule(documentId: number, keywords: string[]): RuleRow {
  const info = getDb()
    .prepare('INSERT INTO doc_rules (document_id, keywords) VALUES (?, ?)')
    .run(documentId, JSON.stringify(keywords));
  return getRule(Number(info.lastInsertRowid)) as RuleRow;
}

export function updateRule(id: number, keywords: string[]): RuleRow | undefined {
  const info = getDb().prepare('UPDATE doc_rules SET keywords = ? WHERE id = ?').run(JSON.stringify(keywords), id);
  if (info.changes === 0) return undefined;
  return getRule(id);
}

export function deleteRule(id: number): boolean {
  const info = getDb().prepare('DELETE FROM doc_rules WHERE id = ?').run(id);
  return info.changes > 0;
}

export function listKeywords(documentId: number): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const rule of listRules(documentId)) {
    for (const keyword of rule.keywords) {
      if (seen.has(keyword)) continue;
      seen.add(keyword);
      keywords.push(keyword);
    }
  }
  return keywords;
}

export function getPrompt(documentId: number): PromptRow | undefined {
  return getDb().prepare('SELECT * FROM doc_prompts WHERE document_id = ?').get(documentId) as PromptRow | undefined;
}

export function upsertPrompt(documentId: number, prompt: string): PromptRow {
  getDb()
    .prepare(
      `INSERT INTO doc_prompts (document_id, prompt) VALUES (?, ?)
       ON CONFLICT(document_id) DO UPDATE SET prompt = excluded.prompt`,
    )
    .run(documentId, prompt);
  return getPrompt(documentId) as PromptRow;
}

export function deletePrompt(documentId: number): boolean {
  const info = getDb().prepare('DELETE FROM doc_prompts WHERE document_id = ?').run(documentId);
  return info.changes > 0;
}

/** 用一组关键词整体替换该文档的规则，供配置 API 写入扁平关键词列表。 */
export function replaceKeywords(documentId: number, keywords: string[]): void {
  const db = getDb();
  const apply = db.transaction(() => {
    db.prepare('DELETE FROM doc_rules WHERE document_id = ?').run(documentId);
    if (keywords.length > 0) {
      db.prepare('INSERT INTO doc_rules (document_id, keywords) VALUES (?, ?)').run(
        documentId,
        JSON.stringify(keywords),
      );
    }
  });
  apply();
}

export function setDocumentConfig(documentId: number, keywords: string[], prompt: string | null): void {
  const db = getDb();
  const apply = db.transaction(() => {
    replaceKeywords(documentId, keywords);
    if (prompt) {
      upsertPrompt(documentId, prompt);
    } else {
      deletePrompt(documentId);
    }
  });
  apply();
}

export function createInput(rawText: string, status: InputStatus = 'pending'): InputRow {
  const info = getDb().prepare('INSERT INTO inputs (raw_text, status) VALUES (?, ?)').run(rawText, status);
  return getInput(Number(info.lastInsertRowid)) as InputRow;
}

export function getInput(id: number): InputRow | undefined {
  return getDb().prepare('SELECT * FROM inputs WHERE id = ?').get(id) as InputRow | undefined;
}

export function listInputs(page: number, pageSize: number): { total: number; items: InputRow[] } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) AS count FROM inputs').get() as { count: number }).count;
  const items = db
    .prepare('SELECT * FROM inputs ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(pageSize, (page - 1) * pageSize) as InputRow[];
  return { total, items };
}

export function updateInput(
  id: number,
  patch: { raw_text?: string; status?: InputStatus },
): InputRow | undefined {
  const existing = getInput(id);
  if (!existing) return undefined;
  getDb()
    .prepare('UPDATE inputs SET raw_text = ?, status = ? WHERE id = ?')
    .run(patch.raw_text ?? existing.raw_text, patch.status ?? existing.status, id);
  return getInput(id);
}

export function deleteInput(id: number): boolean {
  const info = getDb().prepare('DELETE FROM inputs WHERE id = ?').run(id);
  return info.changes > 0;
}

export function createEntry(input: {
  input_id: number;
  text: string;
  status: EntryStatus;
  document_id?: number | null;
  block_id?: string | null;
  day_key?: string | null;
  week_key?: string | null;
}): EntryRow {
  const info = getDb()
    .prepare(
      `INSERT INTO entries (input_id, text, status, document_id, block_id, day_key, week_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.input_id,
      input.text,
      input.status,
      input.document_id ?? null,
      input.block_id ?? null,
      input.day_key ?? null,
      input.week_key ?? null,
    );
  return getEntry(Number(info.lastInsertRowid)) as EntryRow;
}

export function getEntry(id: number): EntryRow | undefined {
  return getDb().prepare('SELECT * FROM entries WHERE id = ?').get(id) as EntryRow | undefined;
}

export function listEntriesByInput(inputId: number): EntryRow[] {
  return getDb().prepare('SELECT * FROM entries WHERE input_id = ? ORDER BY id ASC').all(inputId) as EntryRow[];
}

export function listEntries(): EntryRow[] {
  return getDb().prepare('SELECT * FROM entries ORDER BY id DESC').all() as EntryRow[];
}

export function updateEntry(
  id: number,
  patch: {
    text?: string;
    status?: EntryStatus;
    document_id?: number | null;
    block_id?: string | null;
    day_key?: string | null;
    week_key?: string | null;
  },
): EntryRow | undefined {
  const existing = getEntry(id);
  if (!existing) return undefined;
  getDb()
    .prepare(
      `UPDATE entries
       SET text = ?, status = ?, document_id = ?, block_id = ?, day_key = ?, week_key = ?,
           updated_at = datetime('now','localtime')
       WHERE id = ?`,
    )
    .run(
      patch.text ?? existing.text,
      patch.status ?? existing.status,
      patch.document_id === undefined ? existing.document_id : patch.document_id,
      patch.block_id === undefined ? existing.block_id : patch.block_id,
      patch.day_key === undefined ? existing.day_key : patch.day_key,
      patch.week_key === undefined ? existing.week_key : patch.week_key,
      id,
    );
  return getEntry(id);
}

export function deleteEntry(id: number): boolean {
  const info = getDb().prepare('DELETE FROM entries WHERE id = ?').run(id);
  return info.changes > 0;
}

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function deleteSetting(key: string): boolean {
  const info = getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
  return info.changes > 0;
}

export function listSettingKeys(): string[] {
  const rows = getDb().prepare('SELECT key FROM settings ORDER BY key ASC').all() as { key: string }[];
  return rows.map((row) => row.key);
}
