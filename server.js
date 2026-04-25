// 装配层。会话中间件 + 路由分发 + 静态文件。
// 启动需 Node 22.5+ 并带 --experimental-sqlite（npm start 已配置）。
// TAG: hmt---

import http from 'node:http';
import { join } from 'node:path';

import { handleChat } from './routes/chat.js';
import { handleGenerate } from './routes/generate.js';
import { handleGallery } from './routes/gallery.js';
import { handleTestProfile } from './routes/test-profile.js';
import { handleAuthRoute } from './routes/auth.js';
import { handleUsersRoute } from './routes/users.js';
import { handleProfileRoute } from './routes/profile.js';
import { createStaticHandler } from './routes/static.js';

import attachSession from './middleware/session.js';
import { requireAuth, requireCsrf } from './middleware/guard.js';

import { migrate, sessions } from './services/db.js';
import { sendJson } from './utils/http.js';
import { logger } from './utils/logger.js';

const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = process.cwd();
const PUBLIC_DIR = join(ROOT_DIR, 'public');
const serveStatic = createStaticHandler(PUBLIC_DIR, ROOT_DIR);

// 启动前先建表 + 处理 legacy gallery.json 迁移
migrate();

const server = http.createServer(async (req, res) => {
  // 任何请求都先尝试附会话；未登录场景下 req.session = null
  attachSession(req, res);

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // ---- /api/* 路由 ----
  if (pathname.startsWith('/api/')) {
    // 所有非 GET 请求统一走 CSRF（登录/注册即使未登录也要校验同源 + X-Requested-With）
    if (!requireCsrf(req, res)) return;

    if (pathname.startsWith('/api/auth/')) {
      return handleAuthRoute(req, res, pathname);
    }

    // 其他业务接口必须登录
    if (!requireAuth(req, res)) return;

    if (pathname.startsWith('/api/users')) {
      return handleUsersRoute(req, res, pathname, url);
    }
    if (pathname.startsWith('/api/profile')) {
      return handleProfileRoute(req, res, pathname);
    }
    if (req.method === 'POST' && pathname === '/api/generate') return handleGenerate(req, res);
    if (req.method === 'POST' && pathname === '/api/chat') return handleChat(req, res);
    if (req.method === 'POST' && pathname === '/api/test-profile') return handleTestProfile(req, res);
    if (req.method === 'GET' && pathname === '/api/gallery') return handleGallery(req, res);

    return sendJson(res, 404, { error: 'not found' });
  }

  // ---- 静态文件 ----
  // 静态根（/、/login.html、/modules/*.js、/styles.css、/shared/*、/gallery-files/*）一律允许 GET
  // /gallery-files/* 内部按 req.session 校验归属
  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res);
  }
  res.writeHead(405, { allow: 'GET, POST' });
  res.end('Method not allowed');
});

// 每小时清一次过期 session
const cleaner = setInterval(() => {
  try {
    const removed = sessions.destroyExpired();
    if (removed) logger.info('sessions.cleanup', { removed });
  } catch (err) {
    logger.warn('sessions.cleanup_failed', { error: err.message });
  }
}, 60 * 60 * 1000);
cleaner.unref?.();

server.listen(PORT, () => {
  console.log(`Image Studio running at http://localhost:${PORT}`);
});
