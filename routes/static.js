// 静态文件路由。
// 主根：public/；额外根：/shared/* 映射到项目根的 shared/（供浏览器 ESM import）。
// 仍然防止路径穿越。

import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

export function createStaticHandler(publicDir, rootDir = publicDir + '/..') {
  const sharedDir = join(rootDir, 'shared');

  function resolveFile(pathname) {
    // /shared/* —— 映射到项目根的 shared/，限制在 sharedDir 内。
    if (pathname.startsWith('/shared/')) {
      const rel = normalize(pathname.slice('/shared/'.length)).replace(/^([.][.][/\\])+/, '');
      const filePath = join(sharedDir, rel);
      return { filePath, root: sharedDir };
    }
    // 默认：public/ 下。
    const requested = pathname === '/' ? '/index.html' : pathname;
    const safePath = normalize(requested).replace(/^([.][.][/\\])+/, '');
    const filePath = join(publicDir, safePath);
    return { filePath, root: publicDir };
  }

  return async function serveStatic(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    const { filePath, root } = resolveFile(pathname);

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const content = await readFile(filePath);
      res.writeHead(200, {
        'content-type': MIME[extname(filePath)] || 'application/octet-stream',
        'cache-control': 'no-cache'
      });
      res.end(content);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  };
}
