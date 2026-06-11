import {
  MAX_PROMPT_HISTORY,
  createPromptId,
  deriveTitle,
  mergeTags,
  normalizeTags
} from './prompt-utils.js';

function promptEntryMeta(meta = {}) {
  return {
    model: meta.model || '',
    size: meta.size || '',
    quality: meta.quality || '',
    outputFormat: meta.outputFormat || '',
    sref: meta.sref || '',
    sourceHot: meta.sourceHot || '',
    sourceName: meta.sourceName || '',
    sourceUrl: meta.sourceUrl || '',
    previewImages: Array.isArray(meta.previewImages) ? meta.previewImages : []
  };
}

function trimPromptHistory(history) {
  if (history.length <= MAX_PROMPT_HISTORY) return history;
  const pinned = history.filter((item) => item.pinned).slice(0, MAX_PROMPT_HISTORY);
  const unpinned = history
    .filter((item) => !item.pinned)
    .slice(0, Math.max(0, MAX_PROMPT_HISTORY - pinned.length));
  return [...pinned, ...unpinned];
}

export function upsertPromptHistoryEntry(history, prompt, meta = {}, { now = new Date().toISOString() } = {}) {
  const normalizedPrompt = String(prompt || '').trim();
  if (!normalizedPrompt) {
    return { history: Array.isArray(history) ? history : [], entry: null, changed: false };
  }

  const source = meta.source || 'manual';
  const current = Array.isArray(history) ? history : [];
  const index = current.findIndex((item) => item.prompt === normalizedPrompt);
  const title = meta.title ? String(meta.title).trim() : '';
  const entryMeta = promptEntryMeta(meta);
  let next;

  if (index >= 0) {
    const existing = current[index];
    const updated = {
      ...existing,
      title: title || existing.title || deriveTitle(normalizedPrompt),
      tags: mergeTags(existing.tags, meta.tags),
      source: existing.source === 'studio' ? existing.source : source,
      updatedAt: now,
      lastUsedAt: source === 'studio' ? now : existing.lastUsedAt,
      useCount: existing.useCount + (source === 'studio' ? 1 : 0),
      parts: meta.parts || existing.parts || null,
      meta: { ...existing.meta, ...entryMeta }
    };
    next = [updated, ...current.slice(0, index), ...current.slice(index + 1)];
  } else {
    next = [{
      id: createPromptId(),
      title: title || deriveTitle(normalizedPrompt),
      prompt: normalizedPrompt,
      tags: normalizeTags(meta.tags),
      source,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: source === 'studio' ? now : '',
      useCount: source === 'studio' ? 1 : 0,
      pinned: false,
      isPublic: false,
      squareId: '',
      publishedAt: '',
      parts: meta.parts || null,
      meta: entryMeta
    }, ...current];
  }

  const trimmed = trimPromptHistory(next);
  return { history: trimmed, entry: trimmed[0] || null, changed: true };
}
