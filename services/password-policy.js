const MIN_PASSWORD_LEN = 8;

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  'password',
  'password1',
  'password12',
  'password123',
  'qwerty123',
  'qwertyui',
  'letmein123',
  'admin123',
  'admin1234',
  'changeme',
  'changeme1',
  'iloveyou',
  'welcome1',
  'welcome123'
]);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function emailLocalPart(email) {
  return normalize(email).split('@')[0] || '';
}

function containsIdentity(password, identity) {
  const token = normalize(identity).replace(/[^a-z0-9_-]/g, '');
  if (token.length < 3) return false;
  return normalize(password).includes(token);
}

export function assertPasswordAllowed(password, { username = '', email = '', oldPassword = '' } = {}) {
  const text = String(password || '');
  if (text.length < MIN_PASSWORD_LEN) {
    throw new Error(`password must be at least ${MIN_PASSWORD_LEN} characters`);
  }
  const normalized = normalize(text);
  if (COMMON_PASSWORDS.has(normalized)) {
    throw new Error('password is too common');
  }
  if (oldPassword && text === String(oldPassword)) {
    throw new Error('new password must be different from old password');
  }
  if (containsIdentity(text, username) || containsIdentity(text, emailLocalPart(email))) {
    throw new Error('password must not contain username or email');
  }
}
