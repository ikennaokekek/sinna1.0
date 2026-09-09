import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('Core worker Reserved VM contract invariants', () => {
  assert.match(execFileSync(process.execPath, ['scripts/validate-core-worker-reserved-vm.mjs'], { encoding: 'utf8' }), /contract valid/);
});