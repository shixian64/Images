// /api/prompt-examples —— 上传提示词历史/广场可用的示例图。

import { record as auditRecord } from '../services/audit.js';
import { savePromptExampleImage } from '../services/prompt-example-images.js';
import { bodyErrorStatus, readMultipartFormData, sendJson } from '../utils/http.js';

function firstImageFile(files = []) {
  return files.find((file) => file.fieldName === 'image')
    || files.find((file) => /^image\//i.test(file.contentType || ''))
    || files[0]
    || null;
}

export async function handlePromptExamplesRoute(req, res, pathname) {
  if (pathname !== '/api/prompt-examples' && pathname !== '/api/prompt-examples/') {
    return sendJson(res, 404, { error: 'not found' });
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method not allowed' });
  }

  let form;
  try {
    form = await readMultipartFormData(req);
  } catch (err) {
    return sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid multipart body', code: err.code });
  }

  const file = firstImageFile(form.files);
  if (!file) return sendJson(res, 400, { error: 'image file is required' });

  try {
    const image = await savePromptExampleImage({
      userId: req.session.user.id,
      file,
      prompt: form.fields.prompt || '',
      title: form.fields.title || ''
    });
    auditRecord(req, 'prompt_example.upload', { type: 'image', id: image.id }, {
      bytes: image.bytes,
      mimeType: image.mimeType
    });
    return sendJson(res, 201, { image });
  } catch (err) {
    return sendJson(res, bodyErrorStatus(err), { error: err.message || 'upload failed', code: err.code });
  }
}

export default handlePromptExamplesRoute;
