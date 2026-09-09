import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateProductionStripeSecrets } from './validate-core-api-autoscale.mjs';

test('Core API Replit Autoscale contract invariants', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-core-api-autoscale.mjs'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Autoscale contract valid/);
});

test('requires live-only Stripe names in the production API contract', () => {
  const manifest = readFileSync('infra/replit/core-api-autoscale.yaml', 'utf8');
  assert.doesNotThrow(() => validateProductionStripeSecrets(manifest));
  assert.throws(
    () =>
      validateProductionStripeSecrets(
        manifest.replace('STRIPE_SECRET_KEY_LIVE', 'STRIPE_SECRET_KEY'),
      ),
    /STRIPE_SECRET_KEY_LIVE/,
  );
  assert.throws(
    () =>
      validateProductionStripeSecrets(
        manifest.replace('STRIPE_WEBHOOK_SECRET_LIVE', 'STRIPE_WEBHOOK_SECRET'),
      ),
    /STRIPE_WEBHOOK_SECRET_LIVE/,
  );
  assert.throws(
    () =>
      validateProductionStripeSecrets(
        manifest.replace('  - DATABASE_URL', '  - DATABASE_URL\n  - STRIPE_SECRET_KEY'),
      ),
    /generic Stripe secret prohibited/,
  );
});
