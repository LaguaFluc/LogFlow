import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getSetting, setSetting } from './db';
import { HttpError } from './httpError';

/** server/src 或 server/dist 的上两级都是仓库根目录。 */
export const projectRoot = path.resolve(__dirname, '../..');

const ENV_DEEPSEEK = 'DEEPSEEK_API_KEY';
const ENV_FEISHU_APP_ID = 'FEISHU_APP_ID';
const ENV_FEISHU_APP_SECRET = 'FEISHU_APP_SECRET';

const SETTING_DEEPSEEK = 'deepseek_api_key';
const SETTING_FEISHU_APP_ID = 'feishu_app_id';
const SETTING_FEISHU_APP_SECRET = 'feishu_app_secret';

/**
 * 读取凭证文件。仓库根目录 `.env` 先载入（当前凭证放在这里）；
 * `server/.env` 只补齐尚未设置的变量。两者都优先于 settings 表。
 * 不覆盖进程里已经存在的环境变量。
 */
export function loadEnv(): void {
  const rootEnv = path.join(projectRoot, '.env');
  const serverEnv = path.join(projectRoot, 'server', '.env');
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
  if (fs.existsSync(serverEnv)) {
    dotenv.config({ path: serverEnv });
  }
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return '****';
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

type Resolved = { value: string | null };

function readEnv(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

/** .env 优先，缺省再读 settings 表。 */
function resolveCredential(envName: string, settingKey: string): Resolved {
  const fromEnv = readEnv(envName);
  if (fromEnv) return { value: fromEnv };
  const stored = getSetting(settingKey)?.trim() ?? '';
  return { value: stored.length > 0 ? stored : null };
}

export type PublicSettings = {
  deepseek_key_set: boolean;
  feishu_configured: boolean;
  deepseek_key?: string;
  feishu_app_id?: string;
};

export function getPublicSettings(): PublicSettings {
  const deepseek = resolveCredential(ENV_DEEPSEEK, SETTING_DEEPSEEK);
  const appId = resolveCredential(ENV_FEISHU_APP_ID, SETTING_FEISHU_APP_ID);
  const secret = resolveCredential(ENV_FEISHU_APP_SECRET, SETTING_FEISHU_APP_SECRET);
  const result: PublicSettings = {
    deepseek_key_set: deepseek.value !== null,
    feishu_configured: appId.value !== null && secret.value !== null,
  };
  if (deepseek.value) result.deepseek_key = maskSecret(deepseek.value);
  if (appId.value) result.feishu_app_id = appId.value;
  return result;
}

const SETTING_FIELDS = {
  deepseek_api_key: SETTING_DEEPSEEK,
  feishu_app_id: SETTING_FEISHU_APP_ID,
  feishu_app_secret: SETTING_FEISHU_APP_SECRET,
} as const;

const FIELD_LABEL: Record<keyof typeof SETTING_FIELDS, string> = {
  deepseek_api_key: 'DeepSeek API Key',
  feishu_app_id: '飞书 App ID',
  feishu_app_secret: '飞书 App Secret',
};

/** 只把非空字段写入 settings 表。留空表示不更新。 */
export function saveSettings(body: unknown): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, '请求体格式不正确');
  }
  const record = body as Record<string, unknown>;
  const allowed = Object.keys(SETTING_FIELDS);
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new HttpError(400, `不支持的设置项：${key}`);
    }
  }
  for (const field of allowed as (keyof typeof SETTING_FIELDS)[]) {
    if (!(field in record)) continue;
    const raw = record[field];
    if (raw === null || raw === undefined) continue;
    if (typeof raw !== 'string') {
      throw new HttpError(400, `${FIELD_LABEL[field]}必须是字符串`);
    }
    const value = raw.trim();
    if (!value) continue;
    setSetting(SETTING_FIELDS[field], value);
  }
}
