import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('core deployment contract invariants', () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/validate-core-deployment-contract.mjs'], { stdio: 'pipe' }));
});

test('rejects enabling automatic deployment in the legacy Render blueprint', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sinna-render-contract-'));
  const renderPath = path.join(directory, 'render.yaml');
  const render = await readFile('render.yaml', 'utf8');
  await writeFile(renderPath, render.replace('autoDeploy: false', 'autoDeploy: true'));
  assert.throws(
    () => execFileSync(process.execPath, ['scripts/validate-core-deployment-contract.mjs'], {
      stdio: 'pipe',
      env: { ...process.env, CORE_RENDER_CONTRACT_PATH: renderPath },
    }),
    /legacy Render service must remain manual-only/,
  );
});

test('rejects production promotion without successful exact-revision staging enforcement', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sinna-promotion-contract-'));
  const promotionPath = path.join(directory, 'production-promotion.yaml');
  const promotion = await readFile('.github/workflows/production-promotion.yaml', 'utf8');
  await writeFile(promotionPath, promotion.replace("check.conclusion === 'success'", "check.conclusion === 'skipped'"));
  assert.throws(
    () => execFileSync(process.execPath, ['scripts/validate-core-deployment-contract.mjs'], {
      stdio: 'pipe',
      env: { ...process.env, CORE_PROMOTION_WORKFLOW_PATH: promotionPath },
    }),
    /production promotion staging gate missing/,
  );
});