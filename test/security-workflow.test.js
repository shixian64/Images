import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function reEscape(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

test('CI runs pinned Trivy security scans', () => {
  const workflow = readFileSync('.github/workflows/test.yml', 'utf8');
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  const baseImage = dockerfile.match(/^FROM\s+(.+)$/m)?.[1] || '';
  const trivyActionUses = workflow.match(/uses:\s+aquasecurity\/trivy-action@[a-f0-9]{40}/g) || [];

  assert.match(workflow, /^\s+security-scan:\s*$/m);
  assert.equal(trivyActionUses.length, 2);
  assert.doesNotMatch(workflow, /aquasecurity\/trivy-action@v\d/);
  assert.match(workflow, /version:\s+v\d+\.\d+\.\d+/);

  assert.match(workflow, /scan-type:\s+fs/);
  assert.match(workflow, /scanners:\s+vuln,secret,misconfig/);
  assert.match(workflow, /skip-dirs:\s+generated/);
  assert.match(workflow, /exit-code:\s+'1'/);

  assert.match(workflow, /scan-type:\s+image/);
  assert.match(workflow, new RegExp(`image-ref:\\s+${reEscape(baseImage)}`));
});
