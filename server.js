// 装配层。会话中间件 + 路由分发 + 静态文件。
// 启动需 Node 22.5+ 并带 --experimental-sqlite（npm start 已配置）。
// TAG: hmt---

import http from 'node:http';
import { join } from 'node:path';

import { handleChat } from './routes/chat.js';
import { handleGenerate, handleGenerateConfig, handleGenerateStream } from './routes/generate.js';
import { handleGallery } from './routes/gallery.js';
import { handleTestProfile } from './routes/test-profile.js';
import { handleAuthRoute } from './routes/auth.js';
import { handleUsersRoute } from './routes/users.js';
import { handleProfileRoute } from './routes/profile.js';
import { handleAdminGalleryRoute } from './routes/admin-gallery.js';
import { handleQuotaRoute } from './routes/quota.js';
import { handleInterfacesRoute } from './routes/interfaces.js';
import { handlePromptSquareRoute } from './routes/prompt-square.js';
import { handleJobsRoute } from './routes/jobs.js';
import { handleClientLogsRoute } from './routes/client-logs.js';
import { createStaticHandler } from './routes/static.js';

import attachSession from './middleware/session.js';
import { requireAuth, requireCsrf } from './middleware/guard.js';

import { migrate } from './services/db.js';
import { startJobQueue, stopJobQueue } from './services/job-queue.js';
import { startDataMaintenance } from './services/maintenance.js';
import { sendJson } from './utils/http.js';
import { logger } from './utils/logger.js';
import { positiveIntFromEnv, validateEnvConfig } from './utils/config.js';
import { attachTraceId, runWithRequestContext } from './utils/request-context.js';

validateEnvConfig({ logger });

const PORT = positiveIntFromEnv('PORT', 8787);
const ROOT_DIR = process.cwd();
const PUBLIC_DIR = join(ROOT_DIR, 'public');
const serveStatic = createStaticHandler(PUBLIC_DIR, ROOT_DIR);

// 启动前先建表 + 处理 legacy gallery.json 迁移
migrate();
startJobQueue();
const cleaner = startDataMaintenance({ logger });

async function handleRequest(req, res) {
  // 任何请求都先尝试附会话；未登录场景下 req.session = null
  attachSession(req, res);

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/healthz') {
    return sendJson(res, 200, { ok: true, uptimeSec: Math.round(process.uptime()) });
  }

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
    if (pathname.startsWith('/api/admin/gallery')) {
      return handleAdminGalleryRoute(req, res, pathname, url);
    }
    if (pathname.startsWith('/api/admin/quota') || pathname === '/api/quota/me') {
      return handleQuotaRoute(req, res, pathname);
    }
    if (pathname.startsWith('/api/interfaces') || pathname.startsWith('/api/admin/interfaces')) {
      return handleInterfacesRoute(req, res, pathname);
    }
    if (pathname.startsWith('/api/prompt-square')) {
      return handlePromptSquareRoute(req, res, pathname, url);
    }
    if (pathname.startsWith('/api/jobs') || pathname.startsWith('/api/admin/jobs')) {
      return handleJobsRoute(req, res, pathname, url);
    }
    if (pathname.startsWith('/api/client-logs') || pathname.startsWith('/api/admin/client-logs')) {
      return handleClientLogsRoute(req, res, pathname, url);
    }
    if (req.method === 'GET' && pathname === '/api/generate/config') return handleGenerateConfig(req, res);
    if (req.method === 'POST' && pathname === '/api/generate/stream') return handleGenerateStream(req, res);
    if (req.method === 'POST' && pathname === '/api/generate') return handleGenerate(req, res);
    if (req.method === 'POST' && pathname === '/api/chat') return handleChat(req, res);
    if (req.method === 'POST' && pathname === '/api/test-profile') return handleTestProfile(req, res);
    if (req.method === 'GET' && pathname === '/api/gallery') return handleGallery(req, res);
    if (pathname.startsWith('/api/gallery/')) return handleGallery(req, res, pathname);

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
}

const server = http.createServer((req, res) => {
  const traceId = attachTraceId(req, res);
  runWithRequestContext({ traceId }, () => handleRequest(req, res).catch((err) => {
    logger.error('server.request_unhandled', {
      method: req.method,
      url: req.url,
      err
    });
    if (res.headersSent) {
      res.destroy?.();
      return;
    }
    sendJson(res, 500, { error: 'internal server error' });
  }));
});


server.listen(PORT, () => {
  console.log(`Image Studio running at http://localhost:${PORT}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server.shutdown', { signal });
  if (cleaner) clearInterval(cleaner);
  stopJobQueue();
  const forceExit = setTimeout(() => {
    logger.error('server.shutdown_timeout', { signal });
    process.exit(1);
  }, positiveIntFromEnv('SHUTDOWN_TIMEOUT_MS', 10_000));
  forceExit.unref?.();

  server.close((err) => {
    if (err) {
      logger.error('server.shutdown_failed', { signal, error: err.message });
      process.exit(1);
    }
    logger.info('server.shutdown_done', { signal });
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
