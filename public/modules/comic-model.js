import {
  COMIC_PAGE_PANEL_LIMITS,
  clampComicPagePanelCount,
  comicPageStoryboardToJson,
  normalizeComicPageStoryboard
} from '../../shared/comic-workflow.js';

export const FINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timeout']);
export const ACTIVE_JOB_STATUSES = new Set(['queued', 'running']);

export function imageSrcFromItem(item = {}) {
  if (item.local_url) return item.local_url;
  if (item.localUrl) return item.localUrl;
  if (item.url) return item.url;
  if (item.b64_json && String(item.b64_json).startsWith('data:')) return item.b64_json;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
}

export function imageIdFromItem(item = {}) {
  return item.gallery_id || item.galleryId || item.id || '';
}

export function itemPanelIndex(item = {}) {
  const value = item.comicPageIndex ?? item.comic_page_index ?? item.comicPanelIndex ?? item.comic_panel_index ?? item.pageIndex ?? item.panelIndex;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function jobPageIndex(job = {}) {
  const payload = job.payload || {};
  const value = payload.comicPageIndex ?? payload.comic_page_index ?? payload.comicPanelIndex ?? payload.comic_panel_index ?? job.comicPageIndex ?? job.comicPanelIndex;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function latestJobForPage(jobs = [], pageIndex = 1) {
  const matches = (Array.isArray(jobs) ? jobs : [])
    .filter((job) => jobPageIndex(job) === pageIndex)
    .sort((a, b) => {
      const ar = ACTIVE_JOB_STATUSES.has(a.status) ? 0 : 1;
      const br = ACTIVE_JOB_STATUSES.has(b.status) ? 0 : 1;
      if (ar !== br) return ar - br;
      return Number(b.updatedAt || b.finishedAt || b.createdAt || 0) - Number(a.updatedAt || a.finishedAt || a.createdAt || 0);
    });
  return matches[0] || null;
}

export function firstResultItem(job = {}) {
  const items = Array.isArray(job.result?.data) ? job.result.data : [];
  return items.find((item) => imageSrcFromItem(item)) || null;
}

export function generatedEntryFromJob(job = {}) {
  if (!job?.id) return null;
  const item = firstResultItem(job);
  if (job.status === 'succeeded' && item) {
    return { status: 'succeeded', jobId: job.id, item, prompt: job.payload?.prompt || job.promptPreview || '' };
  }
  const status = job.status === 'timeout' ? 'failed' : (job.status || 'pending');
  return {
    status,
    jobId: job.id,
    prompt: job.payload?.prompt || job.promptPreview || '',
    error: job.error || job.progress?.message || ''
  };
}

export function pageStoryboardEditorValue(value) {
  return comicPageStoryboardToJson(value);
}

export function encodeEditorOriginalValue(value = '') {
  return encodeURIComponent(String(value ?? ''));
}

export function decodeEditorOriginalValue(value = '') {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

export function pageStoryboardContentFromSubPanels(pageStoryboard = {}) {
  const subPanels = Array.isArray(pageStoryboard.subPanels) ? pageStoryboard.subPanels : [];
  return subPanels
    .map((item, index) => {
      const label = item.id || String.fromCharCode(65 + index);
      const meta = [item.role, item.area, item.shot].filter(Boolean).join(' / ');
      const content = item.content || item.composition || '';
      return `${label}. ${[meta, content].filter(Boolean).join('：')}`.trim();
    })
    .filter(Boolean)
    .join('\n');
}

export function pageStoryboardContentEditorValue(panel = {}, index = 0) {
  const pageStoryboard = normalizeComicPageStoryboard(panel.pageStoryboard, index);
  if (pageStoryboard?.content) return pageStoryboard.content;
  const fromSubPanels = pageStoryboard ? pageStoryboardContentFromSubPanels(pageStoryboard) : '';
  return fromSubPanels || panel.imagePrompt || panel.beat || '';
}

export function pageStoryboardPanelCountEditorValue(value, fallback = COMIC_PAGE_PANEL_LIMITS.default) {
  const pageStoryboard = normalizeComicPageStoryboard(value);
  return clampComicPagePanelCount(
    pageStoryboard?.panelCount || pageStoryboard?.subPanels?.length || fallback,
    fallback
  );
}

export function parsePageStoryboardEditorValue(raw = '', index = 0) {
  const value = String(raw || '').trim();
  if (!value) return null;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    throw new Error(`第 ${index + 1} 页高级 JSON 不是合法 JSON：${err?.message || err}`);
  }
  const normalized = normalizeComicPageStoryboard(parsed, index);
  if (!normalized) throw new Error(`第 ${index + 1} 页高级 JSON 必须是单页分镜对象。`);
  return normalized;
}

export function splitPageContentLines(content = '') {
  return String(content || '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resizePageSubPanels(pageStoryboard = {}, count = COMIC_PAGE_PANEL_LIMITS.default, content = '') {
  const safeCount = clampComicPagePanelCount(count);
  const existing = Array.isArray(pageStoryboard.subPanels) ? pageStoryboard.subPanels : [];
  const lines = splitPageContentLines(content);
  return Array.from({ length: safeCount }, (_, index) => {
    const source = existing[index] || {};
    return {
      id: source.id || String.fromCharCode(65 + index),
      role: source.role || `第 ${index + 1} 格`,
      area: source.area || '',
      shot: source.shot || '',
      camera: source.camera || '',
      composition: source.composition || '',
      content: lines[index] || source.content || (safeCount === 1 ? content : ''),
      transition: source.transition || ''
    };
  });
}

export function fallbackPageStoryboardFromPanel(panel = {}, index = 0) {
  const content = [
    panel.beat,
    panel.setting ? `场景：${panel.setting}` : '',
    panel.action ? `动作：${panel.action}` : '',
    panel.emotion ? `情绪：${panel.emotion}` : '',
    panel.imagePrompt
  ].filter(Boolean).join('；') || `第 ${index + 1} 页分镜`;
  return normalizeComicPageStoryboard({
    layoutType: `第 ${index + 1} 页自动分镜`,
    layoutKeywords: ['manga page layout', 'editable page storyboard'],
    readingOrder: '按页面主要视觉动线顺序阅读',
    visualHierarchy: panel.composition || '主体清晰，关键动作和情绪优先',
    narrativeFunction: panel.beat || `推进第 ${index + 1} 页剧情`,
    content,
    panelCount: 1,
    subPanels: [
      {
        id: 'A',
        role: '主画格',
        area: '整页或主视觉区域',
        shot: panel.shot || '',
        camera: panel.camera || '',
        composition: panel.composition || '',
        content,
        transition: ''
      }
    ],
    designNotes: '自动兜底生成，可在单页分镜编辑区继续细化。',
    aiPromptAddon: 'single page comic layout, clear readable panels'
  }, index);
}

export function normalizedOrFallbackPageStoryboard(panel = {}, index = 0) {
  return normalizeComicPageStoryboard(panel.pageStoryboard, index)
    || fallbackPageStoryboardFromPanel(panel, index);
}

export function ensureStoryboardPageStoryboards(value) {
  if (!Array.isArray(value?.panels)) return value;
  value.pageStoryboardEnabled = true;
  value.pageCount = value.panels.length;
  value.panels = value.panels.map((panel, index) => ({
    ...panel,
    pageStoryboard: normalizedOrFallbackPageStoryboard(panel, index)
  }));
  return value;
}

function entriesOf(value) {
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.entries());
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.entries(value);
  return [];
}

function editorIndex(value) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function hasEditorValue(value, index) {
  if (!value) return false;
  if (value instanceof Map) return value.has(index);
  if (Array.isArray(value)) return value.some(([key]) => editorIndex(key) === index);
  if (typeof value === 'object') return Object.hasOwn(value, index) || Object.hasOwn(value, String(index));
  return false;
}

function getEditorValue(value, index) {
  if (!value) return undefined;
  if (value instanceof Map) return value.get(index);
  if (Array.isArray(value)) {
    const pair = value.find(([key]) => editorIndex(key) === index);
    return pair?.[1];
  }
  if (typeof value === 'object') return value[index] ?? value[String(index)];
  return undefined;
}

export function applyStoryboardEditorUpdates(value, {
  panelPrompts = null,
  pageStoryboards = null,
  pagePanelCounts = null,
  pageContents = null
} = {}) {
  if (!Array.isArray(value?.panels)) return value;

  for (const [key, prompt] of entriesOf(panelPrompts)) {
    const index = editorIndex(key);
    if (index === null || !value.panels[index]) continue;
    value.panels[index].imagePrompt = String(prompt || '').trim();
  }

  const pageIndexes = new Set();
  for (const source of [pageStoryboards, pagePanelCounts, pageContents]) {
    for (const [key] of entriesOf(source)) {
      const index = editorIndex(key);
      if (index !== null && value.panels[index]) pageIndexes.add(index);
    }
  }

  for (const index of pageIndexes) {
    const panel = value.panels[index];
    if (!panel) continue;
    const hasPageStoryboard = hasEditorValue(pageStoryboards, index);
    const hasPagePanelCount = hasEditorValue(pagePanelCounts, index);
    const hasPageContent = hasEditorValue(pageContents, index);
    const rawStoryboard = hasPageStoryboard
      ? getEditorValue(pageStoryboards, index)
      : panel.pageStoryboard;
    if (!rawStoryboard && !hasPagePanelCount && !hasPageContent) {
      delete panel.pageStoryboard;
      continue;
    }

    let pageStoryboard = normalizeComicPageStoryboard(rawStoryboard, index)
      || normalizedOrFallbackPageStoryboard(panel, index);
    if (hasPagePanelCount) {
      pageStoryboard.panelCount = clampComicPagePanelCount(getEditorValue(pagePanelCounts, index));
    }
    if (hasPageContent) {
      pageStoryboard.content = String(getEditorValue(pageContents, index) || '').trim();
    }
    if (hasPagePanelCount || hasPageContent) {
      pageStoryboard.subPanels = resizePageSubPanels(
        pageStoryboard,
        pageStoryboard.panelCount,
        pageStoryboard.content
      );
    }
    panel.pageStoryboard = pageStoryboard;
  }

  value.pageCount = value.panels.length;
  value.pageStoryboardEnabled = true;
  return value;
}

export function pageStoryboardEditorEnabled(value) {
  return Array.isArray(value?.panels) && value.panels.length > 0;
}

export function totalPagePanelCount(value) {
  if (!Array.isArray(value?.panels)) return 0;
  return value.panels.reduce((sum, panel) => (
    sum + pageStoryboardPanelCountEditorValue(panel.pageStoryboard, 1)
  ), 0);
}
