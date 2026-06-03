export function parseRequestUrl(req) {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
  } catch {
    return null;
  }

  try {
    decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  return url;
}
