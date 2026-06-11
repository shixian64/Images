import { randomUUID } from 'node:crypto';

function multipartEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '')
    .replace(/\n/g, '');
}

function multipartFieldBuffer(boundary, key, value) {
  return Buffer.from([
    `--${boundary}`,
    `Content-Disposition: form-data; name="${multipartEscape(key)}"`,
    '',
    String(value ?? '')
  ].join('\r\n') + '\r\n', 'utf8');
}

function multipartFileBuffer(boundary, file) {
  const fieldName = file.fieldName || 'image[]';
  const filename = file.filename || 'reference.png';
  const contentType = file.contentType || file.mimeType || 'application/octet-stream';
  return Buffer.concat([
    Buffer.from([
      `--${boundary}`,
      `Content-Disposition: form-data; name="${multipartEscape(fieldName)}"; filename="${multipartEscape(filename)}"`,
      `Content-Type: ${contentType}`,
      '',
      ''
    ].join('\r\n'), 'utf8'),
    Buffer.from(file.buffer || Buffer.alloc(0)),
    Buffer.from('\r\n', 'utf8')
  ]);
}

export function buildMultipartBody({ fields = {}, files = [] } = {}) {
  const boundary = `----image-studio-${randomUUID()}`;
  const chunks = [];
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) chunks.push(multipartFieldBuffer(boundary, key, item));
    } else {
      chunks.push(multipartFieldBuffer(boundary, key, value));
    }
  }
  for (const file of files || []) {
    chunks.push(multipartFileBuffer(boundary, file));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return {
    boundary,
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}
