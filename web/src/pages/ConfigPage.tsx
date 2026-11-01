import { PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import KeywordTagsInput from '../components/KeywordTagsInput';
import { parseFeishuDocId } from '../feishuDocId';
import type { DocumentItem, HealthStatus, PublicSettings } from '../types';

type DocFormValues = {
  name: string;
  feishu_doc_id: string;
  is_default: boolean;
  keywords: string[];
  prompt?: string;
};

type SettingsFormValues = {
  deepseek_api_key?: string;
  feishu_app_id?: string;
  feishu_app_secret?: string;
};

function hasClassification(keywords: string[] | undefined, prompt: string | undefined): boolean {
  const keywordCount = (keywords ?? []).map((item) => item.trim()).filter(Boolean).length;
  return keywordCount > 0 || Boolean(prompt?.trim());
}

export default function ConfigPage() {
  const { message } = App.useApp();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentItem | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [docForm] = Form.useForm<DocFormValues>();
  const [settingsForm] = Form.useForm<SettingsFormValues>();
  const lastCompositionEndAt = useRef<number | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      setDocuments(await api<DocumentItem[]>('/api/documents'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '文档列表加载失败');
    } finally {
      setLoadingDocs(false);
    }
  }, [message]);

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const [nextSettings, nextHealth] = await Promise.all([
        api<PublicSettings>('/api/settings'),
        api<HealthStatus>('/api/health'),
      ]);
      setSettings(nextSettings);
      setHealth(nextHealth);
      settingsForm.setFieldsValue({
        feishu_app_id: nextSettings.feishu_app_id ?? '',
        deepseek_api_key: '',
        feishu_app_secret: '',
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '设置加载失败');
    } finally {
      setLoadingSettings(false);
    }
  }, [message, settingsForm]);

  useEffect(() => {
    void loadDocuments();
    void loadSettings();
  }, [loadDocuments, loadSettings]);

  function openCreate() {
    setEditing(null);
    docForm.setFieldsValue({
      name: '',
      feishu_doc_id: '',
      is_default: false,
      keywords: [],
      prompt: '',
    });
    setModalOpen(true);
  }

  function openEdit(document: DocumentItem) {
    setEditing(document);
    docForm.setFieldsValue({
      name: document.name,
      feishu_doc_id: document.feishu_doc_id,
      is_default: document.is_default,
      keywords: document.keywords,
      prompt: document.prompt ?? '',
    });
    setModalOpen(true);
  }

  async function submitDocument(values: DocFormValues) {
    const name = values.name.trim();
    const feishuDocId = parseFeishuDocId(values.feishu_doc_id);
    const keywords = (values.keywords ?? []).map((item) => item.trim()).filter(Boolean);
    const prompt = values.prompt?.trim() ? values.prompt.trim() : null;
    if (!hasClassification(keywords, prompt ?? undefined)) {
      message.error('关键词与对话配置至少填写一项');
      return;
    }
    const configBody = JSON.stringify({ keywords, prompt });
    setSavingDoc(true);
    try {
      if (editing) {
        await api(`/api/documents/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name,
            feishu_doc_id: feishuDocId,
            is_default: Boolean(values.is_default),
          }),
        });
        await api(`/api/documents/${editing.id}/config`, { method: 'PUT', body: configBody });
        message.success('文档已更新');
      } else {
        const created = await api<DocumentItem>('/api/documents', {
          method: 'POST',
          body: JSON.stringify({
            name,
            feishu_doc_id: feishuDocId,
            is_default: Boolean(values.is_default),
          }),
        });
        try {
          await api(`/api/documents/${created.id}/config`, { method: 'PUT', body: configBody });
        } catch (error) {
          await api(`/api/documents/${created.id}`, { method: 'DELETE' });
          throw error;
        }
        message.success('文档已创建');
      }
      setModalOpen(false);
      await loadDocuments();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSavingDoc(false);
    }
  }

  async function removeDocument(id: number) {
    try {
      await api(`/api/documents/${id}`, { method: 'DELETE' });
      message.success('文档已删除');
      await loadDocuments();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    }
  }

  async function submitSettings(values: SettingsFormValues) {
    const payload: SettingsFormValues = {};
    const deepseek = values.deepseek_api_key?.trim();
    const appId = values.feishu_app_id?.trim();
    const secret = values.feishu_app_secret?.trim();
    if (deepseek) payload.deepseek_api_key = deepseek;
    if (appId) payload.feishu_app_id = appId;
    if (secret) payload.feishu_app_secret = secret;
    setSavingSettings(true);
    try {
      const next = await api<PublicSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setSettings(next);
      settingsForm.setFieldsValue({
        feishu_app_id: next.feishu_app_id ?? '',
        deepseek_api_key: '',
        feishu_app_secret: '',
      });
      setHealth(await api<HealthStatus>('/api/health'));
      message.success('设置已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSavingSettings(false);
    }
  }

  function blockImeSubmit(event: React.KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.closest('.keyword-tags')) return;
    const native = event.nativeEvent;
    const composing =
      native.isComposing ||
      (lastCompositionEndAt.current !== null &&
        Math.abs(native.timeStamp - lastCompositionEndAt.current) < 50);
    if (composing) event.preventDefault();
  }

  return (
    <section className="page-shell">
      <header className="page-heading">
        <h1>配置</h1>
        <p>管理打卡文档、关键词和凭证。凭证以仓库根目录 .env 为准。</p>
      </header>
      <Tabs
        items={[
          {
            key: 'documents',
            label: '文档管理',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  新建文档
                </Button>
                <Table<DocumentItem>
                  rowKey="id"
                  loading={loadingDocs}
                  dataSource={documents}
                  pagination={false}
                  locale={{ emptyText: '还没有文档' }}
                  columns={[
                    { title: '名称', dataIndex: 'name' },
                    {
                      title: '飞书文档 ID',
                      dataIndex: 'feishu_doc_id',
                      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
                    },
                    {
                      title: '默认文档',
                      dataIndex: 'is_default',
                      width: 110,
                      render: (value: boolean) => (value ? <Tag>默认</Tag> : '—'),
                    },
                    {
                      title: '关键词',
                      dataIndex: 'keywords',
                      render: (keywords: string[]) =>
                        keywords.length > 0 ? (
                          <Space size={[4, 4]} wrap>
                            {keywords.map((keyword) => (
                              <Tag key={keyword}>{keyword}</Tag>
                            ))}
                          </Space>
                        ) : (
                          '未设置'
                        ),
                    },
                    {
                      title: '对话配置',
                      dataIndex: 'prompt',
                      render: (prompt: string | null) =>
                        prompt ? (
                          <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0, maxWidth: 280 }}>
                            {prompt}
                          </Typography.Paragraph>
                        ) : (
                          '未设置'
                        ),
                    },
                    {
                      title: '操作',
                      key: 'actions',
                      width: 140,
                      render: (_, record) => (
                        <Space>
                          <Button type="link" onClick={() => openEdit(record)} style={{ paddingInline: 0 }}>
                            编辑
                          </Button>
                          <Popconfirm
                            title="确认删除该文档？"
                            description="关键词和对话配置会一并删除。已有条目的归属会清空。"
                            okText="删除"
                            cancelText="取消"
                            onConfirm={() => removeDocument(record.id)}
                          >
                            <Button type="link" danger style={{ paddingInline: 0 }}>
                              删除
                            </Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'settings',
            label: '设置',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%', maxWidth: 640 }}>
                <Alert
                  type="info"
                  showIcon
                  message="凭证读取顺序"
                  description="项目根目录 .env 中的 DEEPSEEK_API_KEY、FEISHU_APP_ID、FEISHU_APP_SECRET 优先于本页保存的值。密钥只显示掩码，不会回显全文。"
                />
                <div aria-live="polite">
                  {health ? (
                    <Space direction="vertical" size={8}>
                      <Typography.Text>
                        DeepSeek API Key：{health.deepseek_key_set ? '已配置' : '未配置'}
                        {settings?.deepseek_key ? `（${settings.deepseek_key}）` : ''}
                      </Typography.Text>
                      <Typography.Text>
                        飞书应用凭证：{health.feishu_configured ? '已配置' : '未配置'}
                      </Typography.Text>
                    </Space>
                  ) : (
                    <Typography.Text type="secondary">正在读取凭证状态…</Typography.Text>
                  )}
                </div>
                <Form<SettingsFormValues>
                  form={settingsForm}
                  layout="vertical"
                  validateTrigger="onBlur"
                  onFinish={submitSettings}
                  onKeyDown={blockImeSubmit}
                  onCompositionEnd={(event) => {
                    lastCompositionEndAt.current = event.nativeEvent.timeStamp;
                  }}
                  disabled={loadingSettings}
                >
                  <Form.Item
                    label="DeepSeek API Key"
                    name="deepseek_api_key"
                    extra={
                      settings?.deepseek_key
                        ? `当前生效：${settings.deepseek_key}。留空则不修改。`
                        : '留空则不修改。'
                    }
                  >
                    <Input.Password
                      autoComplete="new-password"
                      spellCheck={false}
                      autoCapitalize="off"
                      placeholder="sk-..."
                    />
                  </Form.Item>
                  <Form.Item label="飞书 App ID" name="feishu_app_id" extra="留空则不修改。">
                    <Input
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="cli_..."
                    />
                  </Form.Item>
                  <Form.Item
                    label="飞书 App Secret"
                    name="feishu_app_secret"
                    extra={settings?.feishu_configured ? '已配置。留空则不修改。' : '留空则不修改。'}
                  >
                    <Input.Password
                      autoComplete="new-password"
                      spellCheck={false}
                      autoCapitalize="off"
                      placeholder="App Secret"
                    />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={savingSettings}>
                    保存凭证
                  </Button>
                </Form>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑文档' : '新建文档'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
        footer={null}
      >
        <Form<DocFormValues>
          form={docForm}
          layout="vertical"
          validateTrigger="onBlur"
          scrollToFirstError
          onFinish={submitDocument}
          onKeyDown={blockImeSubmit}
          onCompositionEnd={(event) => {
            lastCompositionEndAt.current = event.nativeEvent.timeStamp;
          }}
        >
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, whitespace: true, message: '名称不能为空' }]}
          >
            <Input placeholder="例如：工作日志" />
          </Form.Item>
          <Form.Item
            label="飞书文档 ID"
            name="feishu_doc_id"
            extra="可粘贴 https://xxx.feishu.cn/docx/文档ID，保存时会解析出文档 ID。"
            rules={[
              { required: true, whitespace: true, message: '飞书文档 ID 不能为空' },
              {
                validator: async (_, value: string) => {
                  if (!value || !value.trim()) return;
                  parseFeishuDocId(value);
                },
              },
            ]}
          >
            <Input
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://xxx.feishu.cn/docx/文档ID"
            />
          </Form.Item>
          <Form.Item label="默认文档" name="is_default" valuePropName="checked" extra="全局只能有一个默认文档。">
            <Switch />
          </Form.Item>
          <Form.Item
            label="关键词"
            name="keywords"
            extra="回车添加。关键词与对话配置至少填写一项。"
            dependencies={['prompt']}
            rules={[
              ({ getFieldValue }) => ({
                validator: async (_, value: string[]) => {
                  if (!hasClassification(value, getFieldValue('prompt') as string | undefined)) {
                    throw new Error('关键词与对话配置至少填写一项');
                  }
                },
              }),
            ]}
          >
            <KeywordTagsInput />
          </Form.Item>
          <Form.Item
            label="对话配置"
            name="prompt"
            dependencies={['keywords']}
            rules={[
              ({ getFieldValue }) => ({
                validator: async (_, value: string) => {
                  if (!hasClassification(getFieldValue('keywords') as string[] | undefined, value)) {
                    throw new Error('关键词与对话配置至少填写一项');
                  }
                },
              }),
            ]}
          >
            <Input.TextArea rows={4} placeholder="例如：与技术开发、写代码相关的工作内容" />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={savingDoc}>
              {editing ? '保存修改' : '创建文档'}
            </Button>
            <Button onClick={() => setModalOpen(false)}>取消</Button>
          </Space>
        </Form>
      </Modal>
    </section>
  );
}
