// /api/admin/registration* —— 管理员配置注册入口与邀请码。

import { sendJson, readJsonBody, bodyErrorStatus } from '../utils/http.js';
import { requireAdmin } from '../middleware/guard.js';
import { record as auditRecord } from '../services/audit.js';
import {
  adminRegistrationSnapshot,
  generateRegistrationInviteCodes,
  resetRegistrationInviteCodes,
  setRegistrationSettings
} from '../services/registration-guard.js';

function booleanOrUndefined(value) {
  if (value === undefined) return undefined;
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', 'on', 'enabled'].includes(text)) return true;
  if (['false', 'no', 'off', 'disabled'].includes(text)) return false;
  return undefined;
}

function positiveIntOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) throw new Error('invalid number');
  return Math.floor(n);
}

function settingsPatch(body = {}) {
  const patch = {};
  const allowPublicRegistration = booleanOrUndefined(
    body.allowPublicRegistration ?? body.allowNewUsers ?? body.allowRegistration
  );
  const allowInviteRegistration = booleanOrUndefined(body.allowInviteRegistration);
  if (allowPublicRegistration !== undefined) patch.allowPublicRegistration = allowPublicRegistration;
  if (allowInviteRegistration !== undefined) patch.allowInviteRegistration = allowInviteRegistration;
  const defaultInviteUses = positiveIntOrUndefined(body.defaultInviteUses);
  if (defaultInviteUses !== undefined) patch.defaultInviteUses = defaultInviteUses;
  return patch;
}

async function readBody(req, res) {
  try {
    return await readJsonBody(req);
  } catch (err) {
    sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
    return null;
  }
}

async function handleSettings(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, adminRegistrationSnapshot());
    return;
  }
  if (req.method === 'PUT') {
    const body = await readBody(req, res);
    if (body === null) return;
    try {
      const settings = setRegistrationSettings(settingsPatch(body || {}), req.session.user.id);
      auditRecord(req, 'registration.settings_update', { type: 'system', id: 'registration.settings' }, {
        allowPublicRegistration: settings.allowPublicRegistration,
        allowInviteRegistration: settings.allowInviteRegistration,
        defaultInviteUses: settings.defaultInviteUses
      });
      sendJson(res, 200, adminRegistrationSnapshot());
    } catch (err) {
      sendJson(res, 400, { error: err.message || 'invalid registration settings' });
    }
    return;
  }
  sendJson(res, 405, { error: 'method not allowed' });
}

async function handleGenerateInvites(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  const body = await readBody(req, res);
  if (body === null) return;
  try {
    const generated = generateRegistrationInviteCodes({
      count: positiveIntOrUndefined(body?.count) ?? 1,
      maxUses: positiveIntOrUndefined(body?.maxUses),
      createdBy: req.session.user.id
    });
    auditRecord(req, 'registration.invites_generate', { type: 'system', id: 'registration.invites' }, {
      count: generated.length,
      maxUses: generated[0]?.maxUses || null
    });
    sendJson(res, 200, { ...adminRegistrationSnapshot(), generated });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'failed to generate invites' });
  }
}

async function handleResetInvites(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  const removed = resetRegistrationInviteCodes();
  auditRecord(req, 'registration.invites_reset', { type: 'system', id: 'registration.invites' }, { removed });
  sendJson(res, 200, { ...adminRegistrationSnapshot(), removed });
}

export async function handleRegistrationRoute(req, res, pathname) {
  if (!requireAdmin(req, res)) return;

  if (pathname === '/api/admin/registration' || pathname === '/api/admin/registration/') {
    return handleSettings(req, res);
  }
  if (pathname === '/api/admin/registration/settings') {
    return handleSettings(req, res);
  }
  if (pathname === '/api/admin/registration/invites') {
    return handleGenerateInvites(req, res);
  }
  if (pathname === '/api/admin/registration/invites/reset') {
    return handleResetInvites(req, res);
  }

  sendJson(res, 404, { error: 'not found' });
}

export default handleRegistrationRoute;
