import { HttpError } from './httpError';

const DOC_ID_RE = /^[A-Za-z0-9]{8,64}$/;

/**
 * 接受飞书云文档 ID，或 `https://xxx.feishu.cn/docx/XXXX` 链接（可带 query）。
 * 链接会解析成文档 ID。
 */
export function parseFeishuDocId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new HttpError(400, '飞书文档 ID 不能为空');
  }
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new HttpError(400, '飞书文档链接格式不正确，请使用 https://xxx.feishu.cn/docx/文档ID');
    }
    const hostOk = url.protocol === 'https:' && url.hostname.endsWith('.feishu.cn');
    const parts = url.pathname.split('/').filter(Boolean);
    const token = parts[1] ? decodeURIComponent(parts[1]) : '';
    if (!hostOk || parts[0] !== 'docx' || !DOC_ID_RE.test(token)) {
      throw new HttpError(400, '飞书文档链接格式不正确，请使用 https://xxx.feishu.cn/docx/文档ID');
    }
    return token;
  }
  if (!DOC_ID_RE.test(trimmed)) {
    throw new HttpError(400, '飞书文档 ID 格式不正确，请粘贴 https://xxx.feishu.cn/docx/文档ID 或填写文档 ID');
  }
  return trimmed;
}
