import { sourceLabel } from './prompt-utils.js';

function itemTags(item) {
  return Array.isArray(item?.tags) ? item.tags : [];
}

function periodDays(period) {
  if (period === '24h') return 1;
  if (period === '7d') return 7;
  if (period === '30d') return 30;
  return 0;
}

export function inPromptSquarePeriod(item, period = 'all', now = Date.now()) {
  const days = periodDays(period);
  if (!days) return true;
  const ts = Date.parse(item?.publishedAt || item?.updatedAt || item?.createdAt || '');
  if (!Number.isFinite(ts)) return false;
  return Number(now) - ts <= days * 24 * 60 * 60 * 1000;
}

function matchesPromptSquareKeyword(item, keyword) {
  const normalized = String(keyword || '').trim().toLowerCase();
  if (!normalized) return true;
  const hay = [
    item?.title,
    item?.prompt,
    itemTags(item).join(' '),
    item?.owner?.username || '',
    sourceLabel(item?.source)
  ].join(' ').toLowerCase();
  return hay.includes(normalized);
}

function comparePromptSquareItems(a, b, { sort, currentUserId }) {
  if (sort === 'sourceHot:desc') {
    const diff = (Number(b?.meta?.sourceHot || b?.useCount) || 0)
      - (Number(a?.meta?.sourceHot || a?.useCount) || 0);
    if (diff) return diff;
  } else if (sort === 'useCount:desc') {
    const diff = (Number(b?.useCount) || 0) - (Number(a?.useCount) || 0);
    if (diff) return diff;
  } else if (sort === 'mine:first') {
    const am = a?.owner?.id === currentUserId;
    const bm = b?.owner?.id === currentUserId;
    if (am !== bm) return am ? -1 : 1;
  }
  return String(b?.publishedAt || b?.updatedAt).localeCompare(String(a?.publishedAt || a?.updatedAt));
}

export function filterPromptSquareItems(items, {
  keyword = '',
  tag = 'all',
  sort = 'publishedAt:desc',
  period = 'all',
  currentUserId = '',
  now = Date.now()
} = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => {
      if (!inPromptSquarePeriod(item, period, now)) return false;
      if (tag !== 'all' && !itemTags(item).includes(tag)) return false;
      return matchesPromptSquareKeyword(item, keyword);
    })
    .sort((a, b) => comparePromptSquareItems(a, b, { sort, currentUserId }));
}

export function promptSquareTags(items, { limit = 36 } = {}) {
  return Array.from(new Set((Array.isArray(items) ? items : []).flatMap((item) => itemTags(item))))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .slice(0, limit);
}

export function promptSquareSummaryStats(items, currentUserId = '') {
  const list = Array.isArray(items) ? items : [];
  return {
    total: list.length,
    mine: list.filter((item) => item?.owner?.id === currentUserId).length,
    totalUses: list.reduce((sum, item) => sum + (Number(item?.useCount) || 0), 0)
  };
}
