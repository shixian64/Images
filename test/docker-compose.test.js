import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function envExampleNames() {
  return readFileSync('.env.example', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.split('=', 1)[0].trim())
    .filter((name) => /^[A-Z0-9_]+$/.test(name));
}

function composeVariableReferences() {
  const text = readFileSync('docker-compose.yml', 'utf8');
  return new Set(
    Array.from(text.matchAll(/\$\{([A-Z0-9_]+)/g), (match) => match[1])
  );
}

test('docker compose references every documented .env.example variable', () => {
  const referenced = composeVariableReferences();
  const missing = envExampleNames().filter((name) => !referenced.has(name));

  assert.deepEqual(missing, []);
});
