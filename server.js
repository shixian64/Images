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
import { handlePromptExamplesRoute } from './routes/prompt-examples.js';
import { handlePromptSquareRoute } from './routes/prompt-square.js';
import { handleJobsRoute } from './routes/jobs.js';
import { handleClientLogsRoute } from './routes/client-logs.js';
import { handleComicProjectsRoute } from './routes/comic-projects.js';
import { handleComicStoryboardsRoute } from './routes/comic-storyboards.js';
import { handleRegistrationRoute } from './routes/registration.js';
import { createStaticHandler } from './routes/static.js';

import attachSession from './middleware/session.js';
import { requireAuth, requireCsrf } from './middleware/guard.js';

import { migrate } from './services/db.js';
import { startJobQueue, stopJobQueue } from './services/job-queue.js';
import { startDataMaintenance } from './services/maintenance.js';
import { sendJson, withSecurityHeaders } from './utils/http.js';
import { logger } from './utils/logger.js';
import { positiveIntFromEnv, validateEnvConfig } from './utils/config.js';
import { attachTraceId, runWithRequestContext } from './utils/request-context.js';
import { parseRequestUrl } from './utils/request-url.js';
import { matchesRoutePrefix } from './utils/route-match.js';

validateEnvConfig({ logger });

const PORT = positiveIntFromEnv('PORT', 8787);
const ROOT_DIR = process.cwd();
const PUBLIC_DIR = join(ROOT_DIR, 'public');
const serveStatic = createStaticHandler(PUBLIC_DIR, ROOT_DIR);
const apiPrefix = (prefix) => (pathname) => matchesRoutePrefix(pathname, prefix);

const API_ROUTES = [
  { public: true, match: apiPrefix('/api/auth'), handle: (req, res, pathname) => handleAuthRoute(req, res, pathname) },
  { match: apiPrefix('/api/users'), handle: (req, res, pathname, url) => handleUsersRoute(req, res, pathname, url) },
  { match: apiPrefix('/api/profile'), handle: (req, res, pathname) => handleProfileRoute(req, res, pathname) },
  { match: apiPrefix('/api/admin/gallery'), handle: (req, res, pathname, url) => handleAdminGalleryRoute(req, res, pathname, url) },
  { match: apiPrefix('/api/admin/registration'), handle: (req, res, pathname) => handleRegistrationRoute(req, res, pathname) },
  { match: (pathname) => matchesRoutePrefix(pathname, '/api/admin/quota') || pathname === '/api/quota/me', handle: (req, res, pathname) => handleQuotaRoute(req, res, pathname) },
  { match: (pathname) => matchesRoutePrefix(pathname, '/api/interfaces') || matchesRoutePrefix(pathname, '/api/admin/interfaces'), handle: (req, res, pathname) => handleInterfacesRoute(req, res, pathname) },
  { match: apiPrefix('/api/prompt-examples'), handle: (req, res, pathname) => handlePromptExamplesRoute(req, res, pathname) },
  { match: apiPrefix('/api/prompt-square'), handle: (req, res, pathname, url) => handlePromptSquareRoute(req, res, pathname, url) },
  { match: (pathname) => matchesRoutePrefix(pathname, '/api/jobs') || matchesRoutePrefix(pathname, '/api/admin/jobs'), handle: (req, res, pathname, url) => handleJobsRoute(req, res, pathname, url) },
  { match: (pathname) => matchesRoutePrefix(pathname, '/api/client-logs') || matchesRoutePrefix(pathname, '/api/admin/client-logs'), handle: (req, res, pathname, url) => handleClientLogsRoute(req, res, pathname, url) },
  { match: apiPrefix('/api/comic-projects'), handle: (req, res, pathname, url) => handleComicProjectsRoute(req, res, pathname, url) },
  { match: apiPrefix('/api/comic-storyboards'), handle: (req, res, pathname, url) => handleComicStoryboardsRoute(req, res, pathname, url) },
  { match: (pathname, req) => req.method === 'GET' && pathname === '/api/generate/config', handle: (req, res) => handleGenerateConfig(req, res) },
  { match: (pathname, req) => req.method === 'POST' && pathname === '/api/generate/stream', handle: (req, res) => handleGenerateStream(req, res) },
  { match: (pathname, req) => req.method === 'POST' && pathname === '/api/generate', handle: (req, res) => handleGenerate(req, res) },
  { match: (pathname, req) => req.method === 'POST' && pathname === '/api/chat', handle: (req, res) => handleChat(req, res) },
  { match: (pathname, req) => req.method === 'POST' && pathname === '/api/test-profile', handle: (req, res) => handleTestProfile(req, res) },
  { match: (pathname, req) => req.method === 'GET' && pathname === '/api/gallery', handle: (req, res) => handleGallery(req, res) },
  { match: (pathname) => pathname.startsWith('/api/gallery/'), handle: (req, res, pathname) => handleGallery(req, res, pathname) }
];

function dispatchApiRoute(req, res, pathname, url) {
  // 所有非 GET 请求统一走 CSRF（登录/注册即使未登录也要校验同源 + X-Requested-With）
  if (!requireCsrf(req, res)) return;

  const route = API_ROUTES.find((item) => item.match(pathname, req));
  if (!route) return sendJson(res, 404, { error: 'not found' });

  // 除 /api/auth/* 外，其他业务接口必须登录。
  if (!route.public && !requireAuth(req, res)) return;
  return route.handle(req, res, pathname, url);
}

// 启动前先建表 + 处理 legacy gallery.json 迁移
migrate();
startJobQueue();
const cleaner = startDataMaintenance({ logger });

async function handleRequest(req, res) {
  // 任何请求都先尝试附会话；未登录场景下 req.session = null
  attachSession(req, res);

  const url = parseRequestUrl(req);
  if (!url) {
    return sendJson(res, 400, { error: 'bad request' });
  }
  const pathname = url.pathname;

  if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/healthz') {
    return sendJson(res, 200, { ok: true, uptimeSec: Math.round(process.uptime()) });
  }

  // ---- /api/* 路由 ----
  if (pathname.startsWith('/api/')) {
    return dispatchApiRoute(req, res, pathname, url);
  }

  // ---- 静态文件 ----
  // 静态根（/、/login.html、/modules/*.js、/styles.css、/shared/*、/gallery-files/*）一律允许 GET
  // /gallery-files/* 内部按 req.session 校验归属
  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res);
  }
  res.writeHead(405, withSecurityHeaders({ allow: 'GET, POST' }));
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
