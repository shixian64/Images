export function parseSseBlock(block) {
  let event = 'message';
  const dataLines = [];
  for (const rawLine of String(block || '').split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(':')) continue;
    const index = line.indexOf(':');
    const field = index === -1 ? line : line.slice(0, index);
    let value = index === -1 ? '' : line.slice(index + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    if (field === 'data') dataLines.push(value);
  }
  return { event, data: dataLines.join('\n') };
}

export async function readGenerateStream(resp, { onProgress } = {}) {
  if (!resp.body?.getReader) throw new Error('当前浏览器不支持流式读取。');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  let streamError = null;

  const dispatch = (block) => {
    const parsed = parseSseBlock(block);
    if (!parsed.data) return;
    let data;
    try { data = JSON.parse(parsed.data); } catch { data = { message: parsed.data }; }
    if (parsed.event === 'progress') onProgress?.(data);
    if (parsed.event === 'result') result = data;
    if (parsed.event === 'error') streamError = data;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    if (done) buffer += decoder.decode();

    let index;
    while ((index = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      dispatch(block);
      if (result || streamError) {
        try { await reader.cancel(); } catch { /* noop */ }
        break;
      }
    }

    if (done || result || streamError) break;
  }

  if (!result && !streamError && buffer.trim()) dispatch(buffer);
  if (streamError) throw new Error(streamError.error || `HTTP ${streamError.status || 500}`);
  if (result) return result;
  throw new Error('生成连接已结束，但服务端没有返回结果。');
}
