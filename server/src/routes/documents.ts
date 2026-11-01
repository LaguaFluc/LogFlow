import { Router } from 'express';
import {
  deleteDocument,
  getDocument,
  getPrompt,
  listDocuments,
  listKeywords,
  setDocumentConfig,
  createDocument,
  updateDocument,
  type DocumentRow,
} from '../db';
import { parseFeishuDocId } from '../feishuDocId';
import { HttpError } from '../httpError';

export const documentsRouter = Router();

type DocumentDto = {
  id: number;
  name: string;
  feishu_doc_id: string;
  is_default: boolean;
  keywords: string[];
  prompt: string | null;
  created_at: string;
};

function toDto(row: DocumentRow): DocumentDto {
  return {
    id: row.id,
    name: row.name,
    feishu_doc_id: row.feishu_doc_id,
    is_default: row.is_default === 1,
    keywords: listKeywords(row.id),
    prompt: getPrompt(row.id)?.prompt ?? null,
    created_at: row.created_at,
  };
}

function parseId(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new HttpError(400, '文档 ID 不正确');
  }
  return Number(raw);
}

function requireDocument(id: number): DocumentRow {
  const row = getDocument(id);
  if (!row) throw new HttpError(404, '文档不存在');
  return row;
}

function readName(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new HttpError(400, '名称不能为空');
  }
  return raw.trim();
}

function readIsDefault(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'boolean') {
    throw new HttpError(400, 'is_default 必须是布尔值');
  }
  return raw;
}

function readBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, '请求体格式不正确');
  }
  return body as Record<string, unknown>;
}

function normalizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new HttpError(400, '关键词必须是字符串数组');
  }
  const keywords: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') {
      throw new HttpError(400, '关键词必须是字符串');
    }
    const keyword = item.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }
  return keywords;
}

function normalizePrompt(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string') {
    throw new HttpError(400, '对话配置必须是字符串');
  }
  const prompt = raw.trim();
  return prompt.length > 0 ? prompt : null;
}

documentsRouter.get('/', (_req, res) => {
  res.json(listDocuments().map(toDto));
});

documentsRouter.post('/', (req, res) => {
  const body = readBody(req.body);
  const name = readName(body.name);
  if (typeof body.feishu_doc_id !== 'string' || body.feishu_doc_id.trim().length === 0) {
    throw new HttpError(400, '飞书文档 ID 不能为空');
  }
  const feishuDocId = parseFeishuDocId(body.feishu_doc_id);
  const isDefault = readIsDefault(body.is_default, false);
  const created = createDocument({ name, feishu_doc_id: feishuDocId, is_default: isDefault });
  res.status(201).json(toDto(created));
});

documentsRouter.patch('/:id', (req, res) => {
  const id = parseId(req.params.id);
  requireDocument(id);
  const body = readBody(req.body);
  const hasName = 'name' in body;
  const hasDocId = 'feishu_doc_id' in body;
  const hasDefault = 'is_default' in body;
  if (!hasName && !hasDocId && !hasDefault) {
    throw new HttpError(400, '没有可更新的字段');
  }
  const patch: { name?: string; feishu_doc_id?: string; is_default?: boolean } = {};
  if (hasName) patch.name = readName(body.name);
  if (hasDocId) {
    if (typeof body.feishu_doc_id !== 'string' || body.feishu_doc_id.trim().length === 0) {
      throw new HttpError(400, '飞书文档 ID 不能为空');
    }
    patch.feishu_doc_id = parseFeishuDocId(body.feishu_doc_id);
  }
  if (hasDefault) patch.is_default = readIsDefault(body.is_default, false);
  const updated = updateDocument(id, patch);
  res.json(toDto(updated as DocumentRow));
});

documentsRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  requireDocument(id);
  deleteDocument(id);
  res.json({ ok: true });
});

documentsRouter.get('/:id/config', (req, res) => {
  const id = parseId(req.params.id);
  requireDocument(id);
  res.json({
    keywords: listKeywords(id),
    prompt: getPrompt(id)?.prompt ?? null,
  });
});

documentsRouter.put('/:id/config', (req, res) => {
  const id = parseId(req.params.id);
  requireDocument(id);
  const body = readBody(req.body);
  if (!('keywords' in body) || !('prompt' in body)) {
    throw new HttpError(400, '请提供关键词 keywords 与对话配置 prompt');
  }
  const keywords = normalizeKeywords(body.keywords);
  const prompt = normalizePrompt(body.prompt);
  if (keywords.length === 0 && !prompt) {
    throw new HttpError(400, '关键词与对话配置至少填写一项');
  }
  setDocumentConfig(id, keywords, prompt);
  res.json({ keywords: listKeywords(id), prompt: getPrompt(id)?.prompt ?? null });
});
