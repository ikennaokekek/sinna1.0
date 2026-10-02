#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { assertRuntimeProof } from './lib/eicRuntimeProof';
import { assertIsolation, redact, sha256, verifyStorageOwnership } from './lib/eicValidation';

async function main() {
  const runId = process.argv[2];
  const real = process.argv.includes('--real');
  const local = JSON.parse(execFileSync('node', ['scripts/eic-local-infra.mjs', 'status', runId], { encoding: 'utf8' }));
  const cwd = process.cwd();
  if (execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' }).trim()) {
    throw new Error('commit source before building/starting exact-revision validation runtime');
  }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const directory = path.join(cwd, 'evidence', 'eic-local', runId);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (await fs.realpath(directory) !== directory) throw new Error('symlinked runtime evidence refused');
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', NODE_ENV: 'development',
    DOTENV_CONFIG_PATH: '/dev/null', DATABASE_SSL_MODE: 'disable',
    DATABASE_URL: `postgresql://eic_owner@127.0.0.1:${local.postgresPort}/${local.database}`,
    REDIS_URL: `redis://127.0.0.1:${local.redisPort}`, QUEUE_PREFIX: `sinna:eic:${runId}`,
    EIC_RUN_ID: runId, EIC_REVISION: revision, WORKER_INSTANCE_ID: `eic-${runId}`,
    WORKER_CONCURRENCY: '1', WORKER_SHUTDOWN_TIMEOUT_MS: '5000',
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'), JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  };
  if (real) {
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET',
      'ASSEMBLYAI_API_KEY']) if (process.env[key]) env[key] = process.env[key];
    const file = process.env.MVP_ISOLATION_MANIFEST;
    const proofFile = process.env.MVP_STORAGE_OWNERSHIP_DOCUMENT;
    if (!file || !proofFile) throw new Error('real runtime requires independent isolation and storage evidence');
    await verifyStorageOwnership(env, proofFile, cwd);
    env.MVP_BASE_URL = process.env.MVP_BASE_URL;
    assertIsolation(env, JSON.parse(await fs.readFile(file, 'utf8')), runId, cwd);
  }
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  env.PORT = String((server.address() as net.AddressInfo).port);
  await new Promise<void>(resolve => server.close(() => resolve()));
  env.MVP_BASE_URL = `http://127.0.0.1:${env.PORT}`;
  const attemptId = crypto.randomUUID();
  env.MVP_RUNTIME_RECEIPT = path.join(directory, `runtime-${real ? 'real' : 'local-only'}-${attemptId}.json`);
  const receipt: any = { runId, localResourceRunId: runId, revision, mode: real ? 'real' : 'local-only',
    attemptId, createdAt: new Date().toISOString(), queuePrefix: env.QUEUE_PREFIX, node: process.version, apiPort: Number(env.PORT),
    mediaJobsSubmitted: 0, externalProviderCredentialsAvailable: real, checks: {}, shutdown: {} };
  async function save() { await fs.writeFile(env.MVP_RUNTIME_RECEIPT!, JSON.stringify(receipt, null, 2), { mode: 0o600 }); }
  const children: ChildProcess[] = [];
  const logs: Promise<unknown>[] = [];
  let interrupted = false;
  const onSignal = () => { interrupted = true; for (const child of children) child.kill('SIGTERM'); };
  process.once('SIGTERM', onSignal); process.once('SIGINT', onSignal);
  try {
    for (const pkg of ['@sinna/types', '@sinna/api', '@sinna/worker']) {
      // Invoke the installed compiler, never npx (which can install/network and
      // depends on Replit's inherited XDG configuration).
      execFileSync('pnpm', ['--filter', pkg, 'exec', 'tsc', '-p', 'tsconfig.json'], { cwd, env, stdio: 'pipe', timeout: 120_000 });
    }
    const userObjectCount = Number(execFileSync('psql', ['-X', '-h', '127.0.0.1', '-p', String(local.postgresPort),
      '-U', 'eic_owner', '-d', local.database, '-Atc',
      "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','S','m','f')"],
    { env, encoding: 'utf8', timeout: 10_000 }).trim());
    // Never baseline unknown populated schemas; only reuse a successfully
    // verified ledger in this exact owned disposable resource.
    for (const command of userObjectCount === 0 ? ['bootstrap', 'apply', 'verify'] : ['verify', 'apply', 'verify']) {
      const result = execFileSync('node', ['apps/api/dist/scripts/migrate.js', command], { cwd, env, encoding: 'utf8', timeout: 60_000 });
      await fs.appendFile(path.join(directory, `migrations-${attemptId}.log`), redact(result), { mode: 0o600 });
    }
    for (const role of ['api', 'worker']) {
      const buildHashes: Record<string, string> = {};
      async function hashDirectory(dir: string) {
        for (const name of await fs.readdir(dir, { withFileTypes: true })) {
          const file = path.join(dir, name.name);
          if (name.isDirectory()) await hashDirectory(file);
          else buildHashes[path.relative(cwd, file)] = sha256(await fs.readFile(file));
        }
      }
      await hashDirectory(path.join(cwd, 'apps', role, 'dist'));
      const child = spawn('node', [path.join(cwd, 'apps', role, 'dist', 'index.js')], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
      children.push(child);
      child.on('error', error => { receipt.checks[`${role}Process`] = redact(error.message); });
      // Buffer by line so credentials split across stream chunks cannot escape redaction.
      for (const stream of [child.stdout!, child.stderr!]) {
        let buffer = '';
        stream.on('data', chunk => {
          buffer += chunk.toString();
          const lines = buffer.split('\n'); buffer = lines.pop()!;
          for (const line of lines) logs.push(fs.appendFile(path.join(directory, `${role}-${attemptId}.log`), redact(line) + '\n', { mode: 0o600 }));
        });
        stream.on('end', () => { if (buffer) logs.push(fs.appendFile(path.join(directory, `${role}-${attemptId}.log`), redact(buffer), { mode: 0o600 })); });
      }
      receipt[role] = { pid: child.pid, startTime: (await fs.readFile(`/proc/${child.pid}/stat`, 'utf8')).split(') ').at(-1)!.split(' ')[19], buildHashes };
    }
    await save();
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && !interrupted) {
      try {
        const res = await fetch(`${env.MVP_BASE_URL}/readiness`, { signal: AbortSignal.timeout(1500) });
        const ready = await res.json() as any;
        if (res.ok && ready.ok && ready.checks?.postgres === 'up' && ready.checks?.redis === 'up') {
          receipt.checks.apiReadiness = ready; break;
        }
      } catch { /* startup only; a deadline failure is explicit below */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!receipt.checks.apiReadiness) throw new Error('isolated API readiness deadline failed');
    receipt.checks.runtimeIdentity = await assertRuntimeProof(env, runId, revision, cwd, !real);
    if (real) {
      const workerReady = execFileSync('node', ['apps/worker/dist/readiness.js'], { cwd, env, encoding: 'utf8', timeout: 15_000 });
      receipt.checks.workerReadiness = JSON.parse(workerReady.trim().split('\n').at(-1)!);
    } else {
      const raw = execFileSync('redis-cli', ['-h', '127.0.0.1', '-p', String(local.redisPort), '--raw', 'GET',
        `${env.QUEUE_PREFIX}:worker:heartbeat:${env.WORKER_INSTANCE_ID}`], { env, encoding: 'utf8', timeout: 5000 });
      const heartbeat = JSON.parse(raw);
      if (heartbeat.state !== 'ready' || heartbeat.instanceId !== env.WORKER_INSTANCE_ID
        || Date.now() - heartbeat.updatedAt < 0 || Date.now() - heartbeat.updatedAt > 60_000
        || !['captions', 'ad', 'color', 'video-transform'].every(queue => heartbeat.queues?.includes(queue))) {
        throw new Error('owned worker heartbeat not ready/fresh for all required queues');
      }
      receipt.checks.workerLocalReadiness = { status: 'PASSED', heartbeat };
      receipt.checks.workerProviderReadiness = { status: 'BLOCKED_NOT_TESTED', reason: 'provider credentials deliberately stripped; full worker readiness is not claimed' };
    }
    receipt.verifiedAt = new Date().toISOString(); await save();
    console.log(JSON.stringify({ runId, revision, mode: receipt.mode, checks: receipt.checks, receipt: env.MVP_RUNTIME_RECEIPT }));
    if (real) {
      console.log('Use only the same attested explicit local configuration for the media runner; receipt is live only while these processes remain alive.');
      while (!interrupted) await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    receipt.failure = redact(error instanceof Error ? error.message : error);
    await save(); throw new Error(receipt.failure);
  } finally {
    for (const [i, child] of children.entries()) {
      const stopped = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)));
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 7000))]);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
      receipt.shutdown[i === 0 ? 'api' : 'worker'] = { exitCode: child.exitCode, signal: child.signalCode, at: new Date().toISOString() };
    }
    await Promise.all(logs);
    receipt.logHashes = {};
    for (const name of ['api', 'worker', 'migrations']) {
      try { receipt.logHashes[`${name}-${attemptId}.log`] = sha256(await fs.readFile(path.join(directory, `${name}-${attemptId}.log`))); }
      catch { receipt.logHashes[`${name}-${attemptId}.log`] = 'NOT_AVAILABLE'; }
    }
    receipt.stoppedAt = new Date().toISOString(); await save();
    process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal);
  }
}
main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });