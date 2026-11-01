export type DocumentItem = {
  id: number;
  name: string;
  feishu_doc_id: string;
  is_default: boolean;
  keywords: string[];
  prompt: string | null;
  created_at: string;
};

export type DocumentConfig = {
  keywords: string[];
  prompt: string | null;
};

export type PublicSettings = {
  deepseek_key_set: boolean;
  feishu_configured: boolean;
  deepseek_key?: string;
  feishu_app_id?: string;
};

export type HealthStatus = {
  ok: boolean;
  deepseek_key_set: boolean;
  feishu_configured: boolean;
};
