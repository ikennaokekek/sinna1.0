#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-service-test-'));
const output = path.join(directory, 'service.conf');
try {
  const env = {
    ...process.env,
    SYNTHETIC_PG_URL: 'postgresql://%75ser:p%40ss%27word@127.0.0.1:5433/db%2Dname?sslmode=require&application_name=dr-test',
  };
  const result = spawnSync(process.execPath, [
    path.join(import.meta.dirname, 'write-pg-service.mjs'),
    'SYNTHETIC_PG_URL',
    output,
    'self_test',
  ], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, 'helper should accept an encoded PostgreSQL URL');
  const contents = fs.readFileSync(output, 'utf8');
  assert.match(contents, /^hostaddr=127\.0\.0\.1$/m);
  assert.match(contents, /^port=5433$/m);
  assert.match(contents, /^dbname=db-name$/m);
  assert.match(contents, /^user=user$/m);
  assert.match(contents, /^password=p@ss'word$/m);
  assert.match(contents, /^sslmode=require$/m);
  assert.match(contents, /^application_name=dr-test$/m);
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);

  for (const encoded of ['%20', '%23', '%3B', '%3D', '%5C', '%0A', '%0D', '%00']) {
    const rejected = spawnSync(process.execPath, [
      path.join(import.meta.dirname, 'write-pg-service.mjs'),
      'SYNTHETIC_PG_URL',
      output,
      'self_test',
    ], {
      env: { ...process.env, SYNTHETIC_PG_URL: `postgresql://user:p${encoded}x@127.0.0.1:5433/db` },
      encoding: 'utf8',
    });
    assert.notEqual(rejected.status, 0, `decoded ${encoded} must be rejected`);
  }
  console.log('PostgreSQL service helper self-test passed.');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}