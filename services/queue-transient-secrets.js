// In-memory job secrets for queued custom-interface jobs.
// These are intentionally process-local so API keys are never persisted in SQLite.

const transientJobSecrets = new Map();

function httpError(statusCode, message, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

export function rememberTransientSecret(jobId, secret) {
  if (!secret?.apiKey) return;
  transientJobSecrets.set(jobId, { ...secret });
}

export function getTransientSecret(jobId) {
  const secret = transientJobSecrets.get(jobId);
  return secret ? { ...secret } : null;
}

export function forgetTransientSecret(jobId) {
  transientJobSecrets.delete(jobId);
}

export function runtimeBodyForJob(job) {
  const payload = { ...(job.payload || {}) };
  if (payload.useSystemDefault === true || payload.interfaceMode === 'system') {
    return { ...payload, useSystemDefault: true, interfaceMode: 'system' };
  }
  const secret = transientJobSecrets.get(job.id);
  if (!secret?.apiKey) {
    throw httpError(
      400,
      '个人接口密钥只保存在当前进程内存中；服务重启或任务完成后该任务无法继续，请从 Studio 重新提交。',
      'transient_secret_missing'
    );
  }
  return {
    ...payload,
    useSystemDefault: false,
    interfaceMode: 'custom',
    baseUrl: secret.baseUrl || secret.imageBaseUrl || payload.baseUrl || payload.imageBaseUrl,
    imageBaseUrl: secret.imageBaseUrl || secret.baseUrl || payload.imageBaseUrl || payload.baseUrl,
    apiKey: secret.apiKey,
    imageApiKey: secret.apiKey
  };
}
