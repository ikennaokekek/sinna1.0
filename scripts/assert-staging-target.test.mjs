import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assertStagingTarget } from './assert-staging-target.mjs';

const allowedHost = 'api.staging.example.com';

test('accepts an HTTPS URL on the exact staging host', () => {
  assert.equal(
    assertStagingTarget('https://api.staging.example.com/v1', allowedHost).hostname,
    allowedHost
  );
});

for (const [url, host] of [
  ['http://api.staging.example.com', allowedHost],
  ['https://user:pass@api.staging.example.com', allowedHost],
  ['https://api.staging.example.com/#fragment', allowedHost],
  ['https://localhost', 'localhost'],
  ['https://127.0.0.1', allowedHost],
  ['https://sinna.site', 'sinna.site'],
  ['https://staging.sinna.site', 'staging.sinna.site'],
  ['https://sinna.site.', 'sinna.site.'],
  ['https://sinna1-0.onrender.com', 'sinna1-0.onrender.com'],
  ['https://other.staging.example.com', allowedHost],
]) {
  test(`rejects unsafe target ${url}`, () => {
    assert.throws(() => assertStagingTarget(url, host), /Invalid staging target/);
  });
}

test('CLI accepts an exact safe staging target', () => {
  const result = spawnSync(process.execPath, ['scripts/assert-staging-target.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      STAGING_E2E_BASE_URL: 'https://api.staging.example.com',
      STAGING_ALLOWED_HOST: allowedHost,
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('CLI fails closed when staging configuration is missing', () => {
  const env = { ...process.env };
  delete env.STAGING_E2E_BASE_URL;
  delete env.STAGING_ALLOWED_HOST;
  const result = spawnSync(process.execPath, ['scripts/assert-staging-target.mjs'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /both required/);
});