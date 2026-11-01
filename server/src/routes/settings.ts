import { Router } from 'express';
import { getPublicSettings, saveSettings } from '../config';

export const settingsRouter = Router();

settingsRouter.get('/health', (_req, res) => {
  const settings = getPublicSettings();
  res.json({
    ok: true,
    deepseek_key_set: settings.deepseek_key_set,
    feishu_configured: settings.feishu_configured,
  });
});

settingsRouter.get('/settings', (_req, res) => {
  res.json(getPublicSettings());
});

settingsRouter.put('/settings', (req, res) => {
  saveSettings(req.body);
  res.json(getPublicSettings());
});
