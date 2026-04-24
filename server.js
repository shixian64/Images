// 装配层。路由与业务已拆入 routes/ services/ utils/。
// 未来迁 Next.js（§13.2）时，这个文件就可以下线。

import http from 'node:http';
import { join } from 'node:path';

import { handleChat } from './routes/chat.js';
import { handleGenerate } from './routes/generate.js';
import { handleGallery } from './routes/gallery.js';
import { handleTestProfile } from './routes/test-profile.js';
import { createStaticHandler } from './routes/static.js';

const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = process.cwd();
const PUBLIC_DIR = join(ROOT_DIR, 'public');
const serveStatic = createStaticHandler(PUBLIC_DIR, ROOT_DIR);

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate') return handleGenerate(req, res);
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  if (req.method === 'POST' && req.url === '/api/test-profile') return handleTestProfile(req, res);
  if (req.method === 'GET' && (req.url === '/api/gallery' || req.url?.startsWith('/api/gallery?'))) return handleGallery(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405, { allow: 'GET, POST' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Image Key Manager running at http://localhost:${PORT}`);
});
