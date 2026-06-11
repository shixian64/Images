// Startup seeding for bundled Prompt Square examples.

import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import {
  getPromptSquareSeeds,
  PROMPT_SQUARE_SEED_DIGEST,
  PROMPT_SQUARE_SEED_KEY,
  PROMPT_SQUARE_SEED_TOTAL,
  PROMPTSREF_SREF_SOURCE_URL
} from './prompt-square-seeds.js';

function promptSquareSeedSourceId(seed) {
  return `promptsref:sref:${seed.sref}`;
}

function promptSquareSeedDigest() {
  return PROMPT_SQUARE_SEED_DIGEST;
}

function parsePromptSquareSeedState(value) {
  try {
    const parsed = JSON.parse(String(value || 'null'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function countExistingPromptSquareSeeds(db) {
  if (!PROMPT_SQUARE_SEED_TOTAL) return 0;
  const row = db.prepare(`
    SELECT COUNT(DISTINCT source_prompt_id) AS count
    FROM prompt_square
    WHERE source_prompt_id LIKE 'promptsref:sref:%'
  `).get();
  return Number(row?.count) || 0;
}

export function seedPromptSquareDefaults(db, { nowIso }) {
  const seedKey = PROMPT_SQUARE_SEED_KEY;
  const seedState = parsePromptSquareSeedState(
    db.prepare('SELECT value FROM system_settings WHERE key = ?').get(seedKey)?.value
  );
  const seedDigest = promptSquareSeedDigest();
  const existingSeedCount = countExistingPromptSquareSeeds(db);
  if (
    seedState?.digest === seedDigest
    && Number(seedState?.total) === PROMPT_SQUARE_SEED_TOTAL
    && existingSeedCount >= PROMPT_SQUARE_SEED_TOTAL
  ) {
    return;
  }

  const seeds = getPromptSquareSeeds();
  const exists = db.prepare('SELECT id, published_at FROM prompt_square WHERE source_prompt_id = ? LIMIT 1');
  const insert = db.prepare(`
    INSERT INTO prompt_square
    (id, user_id, source_prompt_id, title, prompt, tags, source, meta, use_count, created_at, updated_at, published_at)
    VALUES (?, NULL, ?, ?, ?, ?, 'seed', ?, 0, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE prompt_square
    SET title = ?, prompt = ?, tags = ?, source = 'seed', meta = ?, updated_at = ?
    WHERE id = ?
  `);
  const startedAt = Date.now();
  let inserted = 0;
  let updated = 0;
  for (const seed of seeds) {
    const sourcePromptId = promptSquareSeedSourceId(seed);
    const existing = exists.get(sourcePromptId);
    const publishedAt = new Date(startedAt - (seed.rank - 1) * 1000).toISOString();
    const meta = {
      seed: true,
      sourceName: 'Promptsref',
      sourceUrl: PROMPTSREF_SREF_SOURCE_URL,
      sourceRank: seed.rank,
      sourceHot: seed.sourceHot,
      sref: seed.sref,
      previewImages: Array.isArray(seed.previewImages) ? seed.previewImages : []
    };
    if (existing) {
      const res = update.run(
        seed.title,
        seed.prompt,
        JSON.stringify(seed.tags),
        JSON.stringify(meta),
        nowIso(),
        existing.id
      );
      if (res.changes) updated += 1;
      continue;
    }
    const res = insert.run(
      randomUUID(),
      sourcePromptId,
      seed.title,
      seed.prompt,
      JSON.stringify(seed.tags),
      JSON.stringify(meta),
      publishedAt,
      publishedAt,
      publishedAt
    );
    if (res.changes) inserted += 1;
  }

  db.prepare(`
    INSERT OR REPLACE INTO system_settings (key, value, updated_at, updated_by)
    VALUES (?, ?, ?, NULL)
  `).run(seedKey, JSON.stringify({
    sourceUrl: PROMPTSREF_SREF_SOURCE_URL,
    digest: seedDigest,
    total: seeds.length,
    inserted,
    updated,
    previousDigest: seedState?.digest || null,
    existingBefore: existingSeedCount
  }), nowIso());
  logger.info('prompt_square.seed.done', {
    source: PROMPT_SQUARE_SEED_KEY,
    inserted,
    updated,
    existingBefore: existingSeedCount
  });
}
