import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { start, status, stop } from '../scripts/eic-local-infra.mjs';
import { removeOwnedQueueJobStrict } from '../scripts/lib/investorMvpCleanup';
it('native disposable resources and cleanup preserve independent runs and pre-existing sentinels', async () => {
  const a = await start(crypto.randomUUID());
  const b = await start(crypto.randomUUID());
  const redis = new IORedis(`redis://127.0.0.1:${a.redisPort}`, { maxRetriesPerRequest: null });
  const prefix = `sinna:eic:${a.runId}`;
  const queue = new Queue('eic-offline-ownership-test', { connection: redis, prefix });
  const otherQueue = new Queue('eic-offline-ownership-test', { connection: redis, prefix: `sinna:eic:${b.runId}` });
  const sentinel = 'older-run-sentinel';
  const pgArgs = ['-X', '-h', '127.0.0.1', '-p', String(a.postgresPort), '-U', 'eic_owner', '-d', a.database];
  const safeEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
  const proof: any = { at: new Date().toISOString(), a, b, assertions: [], outcome: 'running' };
  const output = path.join(process.cwd(), 'evidence/eic-local', `independent-runs-${a.runId}.json`);
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  try {
    execFileSync('psql', [...pgArgs, '-v', 'ON_ERROR_STOP=1', '-c',
      "CREATE TABLE pre_existing_demo_tenants(name text); INSERT INTO pre_existing_demo_tenants VALUES ('investor-mvp-older@example.invalid');"], { env: safeEnv, stdio: 'pipe' });
    await redis.set(sentinel, 'must-survive');
    const mine = await queue.add('owned', { tenantId: a.runId });
    const older = await queue.add('older', { tenantId: 'pre-existing-tenant' });
    const other = await otherQueue.add('other-run', { tenantId: b.runId });
    await expect(removeOwnedQueueJobStrict(queue, String(older.id), a.runId)).rejects.toThrow('not owned');
    await removeOwnedQueueJobStrict(queue, String(mine.id), a.runId);
    expect(await queue.getJob(String(mine.id))).toBeUndefined();
    expect(await queue.getJob(String(older.id))).toBeDefined();
    expect(await otherQueue.getJob(String(other.id))).toBeDefined();
    stop(b.runId);
    expect(status(a.runId).readiness).toBe('verified');
    expect(await redis.get(sentinel)).toBe('must-survive');
    expect(execFileSync('psql', [...pgArgs, '-Atc', 'SELECT name FROM pre_existing_demo_tenants'], { env: safeEnv, encoding: 'utf8' }).trim())
      .toBe('investor-mvp-older@example.invalid');
    proof.assertions = ['owned queue job removed', 'older queue job untouched', 'independent queue untouched',
      'other cluster stopped without affecting first cluster', 'pre-existing DB row and Redis key untouched'];
    proof.outcome = 'passed';
  } catch (error) {
    proof.outcome = 'failed'; proof.error = String(error); throw error;
  } finally {
    await queue.close(); await otherQueue.close(); await redis.quit();
    if (b.state === 'ready') { try { stop(b.runId); } catch { /* already stopped; receipt retained */ } }
    stop(a.runId); proof.finishedAt = new Date().toISOString();
    await fs.writeFile(output, JSON.stringify(proof, null, 2), { mode: 0o600 });
  }
}, 60_000);