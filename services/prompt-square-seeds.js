import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const PROMPTSREF_SREF_SOURCE_URL = 'https://promptsref.com/zh/guide/Best-trending-Sref-Codes';
export const PROMPT_SQUARE_SEED_KEY = 'prompt_square.seed.promptsref_sref_v5_260';
export const PROMPT_SQUARE_SEED_TOTAL = 260;
export const PROMPT_SQUARE_SEED_DIGEST = 'aebeb0ba6de4929d53fbc20774902230bca5445b438544f06820bcf478e7bc30';

const SEEDS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'prompt-square-seeds.json.gz');
let seedCache = null;

export function getPromptSquareSeeds() {
  if (seedCache) return seedCache;
  const parsed = JSON.parse(gunzipSync(readFileSync(SEEDS_PATH)).toString('utf8'));
  if (!Array.isArray(parsed)) throw new Error('prompt square seeds file must contain an array');
  seedCache = Object.freeze(parsed.map((seed) => Object.freeze({ ...seed })));
  return seedCache;
}
