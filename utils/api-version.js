// API version compatibility helpers.
//
// The current route implementations keep their historical /api/* paths.  This
// shim lets clients opt into a stable /api/v1/* prefix without duplicating every
// route handler or breaking existing frontend/scripts.

const API_V1_PREFIX = '/api/v1';

export function normalizeApiPathname(pathname = '') {
  const value = String(pathname || '');
  if (value === API_V1_PREFIX) return '/api';
  if (value.startsWith(`${API_V1_PREFIX}/`)) {
    return `/api/${value.slice(`${API_V1_PREFIX}/`.length)}`;
  }
  return value;
}
