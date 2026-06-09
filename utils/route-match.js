export function matchesRoutePrefix(pathname, prefix) {
  const path = String(pathname || '');
  const base = String(prefix || '').replace(/\/+$/, '');
  if (!base) return false;
  return path === base || path.startsWith(`${base}/`);
}
