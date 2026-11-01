import express, { NextFunction, Request, Response } from 'express';
import { loadEnv } from './config';
import { initDb } from './db';
import { HttpError } from './httpError';
import { documentsRouter } from './routes/documents';
import { settingsRouter } from './routes/settings';

loadEnv();
initDb();

const HOST = '127.0.0.1';
const PORT = 3210;

const app = express();
app.use(express.json());

app.use('/api', settingsRouter);
app.use('/api/documents', documentsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: '请求体不是合法 JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`LogFlow API listening on http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
