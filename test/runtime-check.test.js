import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertRuntimeCompatibility,
  compareNodeVersions,
  parseNodeVersion,
  runtimeCompatibilityReport
} from '../scripts/runtime-check.js';

test('runtime compatibility parsing compares semantic Node versions', () => {
  assert.deepEqual(parseNodeVersion('v22.5.0'), [22, 5, 0]);
  assert.equal(compareNodeVersions('22.5.0', '22.5.0'), 0);
  assert.equal(compareNodeVersions('22.6.0', '22.5.0') > 0, true);
  assert.equal(compareNodeVersions('21.9.0', '22.5.0') < 0, true);
});

test('runtime report fails clearly below the minimum node:sqlite runtime', () => {
  const report = runtimeCompatibilityReport({
    nodeVersion: '22.4.9',
    sqliteVersion: '3.46.0'
  });

  assert.equal(report.ok, false);
  assert.match(report.issues.join('\n'), /22\.5\.0 or newer/);
});

test('runtime report warns when running outside the continuously tested major', () => {
  const report = runtimeCompatibilityReport({
    nodeVersion: '24.15.0',
    sqliteVersion: '3.51.3'
  });

  assert.equal(report.ok, true);
  assert.match(report.warnings.join('\n'), /continuously tested on Node\.js 22\.x/);
});

test('startup preflight verifies node:sqlite before importing the server', async () => {
  const warnings = [];

  await assert.rejects(
    assertRuntimeCompatibility({
      nodeVersion: '22.5.0',
      sqliteVersion: '3.46.0',
      importer: async () => {
        const err = new Error('No such built-in module');
        err.code = 'ERR_UNKNOWN_BUILTIN_MODULE';
        throw err;
      },
      logger: { warn: (message) => warnings.push(message) }
    }),
    /node:sqlite is unavailable/
  );

  assert.deepEqual(warnings, []);
});

test('startup preflight returns a normalized success report', async () => {
  const warnings = [];
  const report = await assertRuntimeCompatibility({
    nodeVersion: '24.15.0',
    sqliteVersion: '3.51.3',
    importer: async () => ({}),
    logger: { warn: (message) => warnings.push(message) }
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.issues, []);
  assert.equal(warnings.length, 1);
});
