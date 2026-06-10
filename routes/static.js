// 静态文件路由。
// 主根：public/；额外根：
// - /shared/* 映射到项目根的 shared/（供浏览器 ESM import）
// - /gallery-files/users/<uid>/images/... 映射到 generated/users/<uid>/images/...
//   仅限当前登录用户（uid 匹配）、admin，或已公开图片的任意登录用户。
// - /gallery-files/images/...（旧迁移路径）通过 images 表查 user_id / is_public 做归属校验。
// - /prompt-example-files/users/<uid>/images/prompt-examples/... 映射到提示词示例图，
//   仅限已登录用户访问，且必须能在 images 表中查到 source_type=prompt_example。
// 统一用 path.normalize + startsWith 做路径穿越防护。

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { images as imagesTable } from '../services/db.js';
import { withSecurityHeaders } from '../utils/http.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

const USER_IMAGE_CACHE_CONTROL = 'private, no-cache, max-age=0';
const DEFAULT_CACHE_CONTROL = 'no-cache';
const VERSIONED_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function send403(res) {
  res.writeHead(403, withSecurityHeaders({ 'content-type': 'text/plain; charset=utf-8' }));
  res.end('Forbidden');
}

function send404(res) {
  res.writeHead(404, withSecurityHeaders({ 'content-type': 'text/plain; charset=utf-8' }));
  res.end('Not found');
}

function send400(res) {
  res.writeHead(400, withSecurityHeaders({ 'content-type': 'text/plain; charset=utf-8' }));
  res.end('Bad request');
}

function etagForStat(fileStat) {
  const size = Number(fileStat.size) || 0;
  const mtimeMs = Math.trunc(Number(fileStat.mtimeMs) || 0);
  return `"${size.toString(16)}-${mtimeMs.toString(16)}"`;
}

function requestMatchesEtag(req, etag) {
  const header = req.headers?.['if-none-match'] || req.headers?.['If-None-Match'];
  if (!header) return false;
  return String(header).split(',').map((part) => part.trim()).some((part) => part === '*' || part === etag);
}

function publicAssetCacheControl(url, filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext !== '.html' && url.searchParams.has('v')) return VERSIONED_ASSET_CACHE_CONTROL;
  return DEFAULT_CACHE_CONTROL;
}

// 判断 filePath 规范化后是否仍在 root 内（防穿越）。
function isInside(filePath, root) {
  const normalizedFile = normalize(filePath);
  const normalizedRoot = normalize(root);
  // 允许完全等于 root，或以 root + 分隔符 开头
  if (normalizedFile === normalizedRoot) return true;
  const withSep = normalizedRoot.endsWith('/') || normalizedRoot.endsWith('\\')
    ? normalizedRoot
    : normalizedRoot + (normalizedRoot.includes('\\') ? '\\' : '/');
  return normalizedFile.startsWith(withSep);
}

export function createStaticHandler(publicDir, rootDir = publicDir + '/..') {
  const sharedDir = normalize(join(rootDir, 'shared'));
  const generatedDir = normalize(join(rootDir, 'generated'));
  const usersRoot = normalize(join(generatedDir, 'users'));
  const legacyImagesRoot = normalize(join(generatedDir, 'images'));

  // 返回 { filePath, root } 或 { forbidden: true } 或 { notFound: true }。
  function resolveGalleryFile(pathname, session) {
    // 期望以 /gallery-files/ 开头
    const rel = pathname.slice('/gallery-files/'.length);
    if (!rel) return { notFound: true };

    // 形态 1：users/<uid>/images/...
    const userMatch = rel.match(/^users\/([^/]+)\/images\/(.+)$/);
    if (userMatch) {
      const uid = userMatch[1];
      const rest = userMatch[2];
      const user = session?.user;
      if (!user) return { forbidden: true };

      const filePath = normalize(join(generatedDir, 'users', uid, 'images', rest));
      const expectedRoot = normalize(join(generatedDir, 'users', uid, 'images'));
      if (!isInside(filePath, expectedRoot)) return { forbidden: true };

      if (user.id === uid || user.role === 'admin') {
        return { filePath, root: expectedRoot };
      }

      // 其他登录用户只能访问已公开的图片文件。
      const lookupKey = ['users', uid, 'images', ...rest.split(/[\\/]+/).filter(Boolean)].join('/');
      const row = imagesTable.findByServedPath(lookupKey);
      if (!row?.is_public) return { forbidden: true };
      return { filePath, root: expectedRoot };
    }

    // 形态 2：旧路径 images/<date>/<file>（迁移前的历史图）
    if (rel.startsWith('images/')) {
      // 相对 generated/ 的路径，保持 db.images.path 的原值一致
      const relPath = normalize(rel);
      const filePath = normalize(join(generatedDir, relPath));
      if (!isInside(filePath, legacyImagesRoot)) return { forbidden: true };

      const user = session?.user;
      if (!user) return { forbidden: true };

      // 用 normalize 后的正向斜杠形式查 db（db 里存的也是 / 分隔）
      const lookupKey = relPath.split(/[\\/]+/).filter(Boolean).join('/');
      const row = imagesTable.findByPath(lookupKey);
      if (!row) return { forbidden: true };
      if (row.user_id !== user.id && user.role !== 'admin' && !row.is_public) return { forbidden: true };

      return { filePath, root: legacyImagesRoot };
    }

    // 其他 /gallery-files/* 一律 404
    return { notFound: true };
  }

  function resolvePromptExampleFile(pathname, session) {
    const user = session?.user;
    if (!user) return { forbidden: true };

    const rel = pathname.slice('/prompt-example-files/'.length);
    if (!rel) return { notFound: true };

    const match = rel.match(/^users\/([^/]+)\/images\/prompt-examples\/(.+)$/);
    if (!match) return { notFound: true };

    const uid = match[1];
    const rest = match[2];
    const filePath = normalize(join(generatedDir, 'users', uid, 'images', 'prompt-examples', rest));
    const expectedRoot = normalize(join(generatedDir, 'users', uid, 'images', 'prompt-examples'));
    if (!isInside(filePath, expectedRoot)) return { forbidden: true };

    const lookupKey = ['users', uid, 'images', 'prompt-examples', ...rest.split(/[\\/]+/).filter(Boolean)].join('/');
    const row = imagesTable.findByPath(lookupKey);
    if (!row || row.source_type !== 'prompt_example') return { forbidden: true };
    return { filePath, root: expectedRoot };
  }

  function resolveFile(pathname, session) {
    // /shared/* —— 映射到项目根的 shared/
    if (pathname.startsWith('/shared/')) {
      const rel = normalize(pathname.slice('/shared/'.length)).replace(/^([.][.][/\\])+/, '');
      const filePath = normalize(join(sharedDir, rel));
      if (!isInside(filePath, sharedDir)) return { forbidden: true };
      return { filePath, root: sharedDir };
    }

    // /gallery-files/* —— 按用户隔离
    if (pathname.startsWith('/gallery-files/')) {
      return resolveGalleryFile(pathname, session);
    }

    if (pathname.startsWith('/prompt-example-files/')) {
      return resolvePromptExampleFile(pathname, session);
    }

    // 默认：public/ 下
    const requested = pathname === '/' ? '/index.html' : pathname;
    const safePath = normalize(requested).replace(/^([.][.][/\\])+/, '');
    const filePath = normalize(join(publicDir, safePath));
    if (!isInside(filePath, normalize(publicDir))) return { forbidden: true };
    return { filePath, root: normalize(publicDir) };
  }

  return async function serveStatic(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      // Bad percent-encoding (for example "/%E0%A4%A") must not escape the
      // request handler and crash the process.
      return send400(res);
    }
    const resolved = resolveFile(pathname, req.session);

    if (resolved.forbidden) return send403(res);
    if (resolved.notFound) return send404(res);

    const { filePath } = resolved;

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) return send404(res);
      const isGalleryFile = pathname.startsWith('/gallery-files/');
      const isPromptExampleFile = pathname.startsWith('/prompt-example-files/');
      const isUserImageFile = isGalleryFile || isPromptExampleFile;
      const cacheHeaders = isUserImageFile
        ? {
            'cache-control': USER_IMAGE_CACHE_CONTROL,
            'etag': etagForStat(fileStat)
          }
        : { 'cache-control': publicAssetCacheControl(url, filePath) };

      if (isUserImageFile && requestMatchesEtag(req, cacheHeaders.etag)) {
        res.writeHead(304, withSecurityHeaders(cacheHeaders));
        res.end();
        return;
      }

      res.writeHead(200, withSecurityHeaders({
        'content-type': MIME[extname(filePath)] || 'application/octet-stream',
        'content-length': fileStat.size,
        ...cacheHeaders
      }));
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      if (typeof res.write !== 'function' || typeof res.on !== 'function') {
        const content = await readFile(filePath);
        res.end(content);
        return;
      }
      const stream = createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) return send404(res);
        res.destroy();
      });
      stream.pipe(res);
    } catch {
      return send404(res);
    }
  };
}
