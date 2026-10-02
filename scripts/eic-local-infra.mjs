#!/usr/bin/env node
// Native, run-owned local infrastructure. Never inherits DATABASE_URL/PG*/REDIS_URL.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const safeEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' };
function exec(bin, args) {
  return execFileSync(bin, args, { env: safeEnv, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
export function ownedRoot(runId, cwd = process.cwd()) {
  if (!uuid.test(runId)) throw new Error('fresh UUID v4 required');
  return path.join(cwd, '.local', 'eic-infra', runId);
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function save(root, receipt) {
  fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
}
export function verifyProcess(pid, ownedPath) {
  if (!Number.isInteger(pid) || pid < 2) throw new Error('invalid owned process');
  const command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
  if (!command.includes(ownedPath)) throw new Error('process does not match run-owned path; refusing action');
}
export function status(runId, cwd = process.cwd()) {
  const root = ownedRoot(runId, cwd);
  if (fs.realpathSync(root) !== root) throw new Error('symlinked infrastructure refused');
  const r = JSON.parse(fs.readFileSync(path.join(root, 'receipt.json'), 'utf8'));
  if (r.runId !== runId || r.root !== root || r.database !== `eic_${runId.replaceAll('-', '_')}`) {
    throw new Error('infrastructure ownership mismatch');
  }
  verifyProcess(r.postgresPid, path.join(root, 'pg'));
  // Redis rewrites its process title; the private pidfile + start-time protect PID reuse.
  const redisPid = Number(fs.readFileSync(path.join(root, 'redis.pid'), 'utf8').trim());
  if (redisPid !== r.redisPid || processStart(redisPid) !== r.redisStart) throw new Error('Redis process identity mismatch');
  const pgInfo = JSON.parse(exec('psql', ['-X', '-h', '127.0.0.1', '-p', String(r.postgresPort),
    '-U', 'eic_owner', '-d', r.database, '-Atc',
    "SELECT json_build_object('database',current_database(),'directory',current_setting('data_directory'),'runId',(SELECT replace(shobj_description(oid,'pg_database'),'sinna-eic:','') FROM pg_database WHERE datname=current_database()))"]));
  const redisMarker = exec('redis-cli', ['-h', '127.0.0.1', '-p', String(r.redisPort), '--raw', 'GET', `eic:owner:${runId}`]);
  if (pgInfo.directory !== path.join(root, 'pg') || pgInfo.runId !== runId || pgInfo.database !== r.database
    || redisMarker !== runId) throw new Error('local protocol readiness/identity check failed');
  return { ...r, checkedAt: new Date().toISOString(), readiness: 'verified' };
}
function processStart(pid) {
  return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').at(-1).split(' ')[19];
}
export async function start(runId, cwd = process.cwd()) {
  const root = ownedRoot(runId, cwd);
  fs.mkdirSync(path.dirname(root), { recursive: true, mode: 0o700 });
  if (fs.realpathSync(path.dirname(root)) !== path.dirname(root)) throw new Error('symlinked parent refused');
  fs.mkdirSync(root, { mode: 0o700 }); // EEXIST blocks reuse, never sweeps older runs.
  const postgresPort = await freePort();
  const redisPort = await freePort();
  const database = `eic_${runId.replaceAll('-', '_')}`;
  const r = { version: 1, runId, root, database, postgresPort, redisPort, postgresPid: 0, redisPid: 0,
    createdAt: new Date().toISOString(), state: 'preparing', tools: {
      postgres: exec('postgres', ['--version']), redis: exec('redis-server', ['--version']),
    } };
  save(root, r);
  try {
    exec('initdb', ['-D', path.join(root, 'pg'), '--username=eic_owner', '--auth=trust', '--no-instructions']);
    exec('pg_ctl', ['-D', path.join(root, 'pg'), '-l', path.join(root, 'postgres.log'),
      '-o', `-h 127.0.0.1 -p ${postgresPort} -k ${root}`, '-w', 'start']);
    r.postgresPid = Number(fs.readFileSync(path.join(root, 'pg', 'postmaster.pid'), 'utf8').split('\n')[0]);
    save(root, r);
    exec('createdb', ['-h', '127.0.0.1', '-p', String(postgresPort), '-U', 'eic_owner', database]);
    exec('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(postgresPort), '-U', 'eic_owner', '-d', database,
      '-c', `COMMENT ON DATABASE "${database}" IS 'sinna-eic:${runId}';`]);
    exec('redis-server', ['--bind', '127.0.0.1', '--protected-mode', 'yes', '--port', String(redisPort),
      '--dir', root, '--pidfile', path.join(root, 'redis.pid'), '--logfile', path.join(root, 'redis.log'),
      '--save', '', '--appendonly', 'no', '--daemonize', 'yes']);
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(path.join(root, 'redis.pid')) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    r.redisPid = Number(fs.readFileSync(path.join(root, 'redis.pid'), 'utf8').trim());
    r.redisStart = processStart(r.redisPid);
    exec('redis-cli', ['-h', '127.0.0.1', '-p', String(redisPort), 'SET', `eic:owner:${runId}`, runId, 'NX']);
    r.state = 'ready'; save(root, r);
    const checked = status(runId, cwd); save(root, checked);
    return checked;
  } catch (error) {
    r.state = 'failed-retained'; r.failure = String(error.message).split('\n')[0]; save(root, r);
    throw new Error(`local setup failed; run-owned state retained at ${root}`);
  }
}
export function recoverSetup(runId, cwd = process.cwd()) {
  const root = ownedRoot(runId, cwd);
  if (fs.realpathSync(root) !== root) throw new Error('symlinked infrastructure refused');
  const r = JSON.parse(fs.readFileSync(path.join(root, 'receipt.json'), 'utf8'));
  if (r.runId !== runId || r.root !== root || r.state !== 'failed-retained') throw new Error('not an owned interrupted setup');
  verifyProcess(r.postgresPid, path.join(root, 'pg'));
  const pid = Number(fs.readFileSync(path.join(root, 'redis.pid'), 'utf8'));
  if (fs.realpathSync(`/proc/${pid}/cwd`) !== root) throw new Error('Redis directory ownership mismatch');
  const dir = exec('redis-cli', ['-h', '127.0.0.1', '-p', String(r.redisPort), '--raw', 'CONFIG', 'GET', 'dir']).split('\n')[1];
  if (dir !== root) throw new Error('Redis server directory mismatch');
  r.redisPid = pid; r.redisStart = processStart(pid);
  exec('redis-cli', ['-h', '127.0.0.1', '-p', String(r.redisPort), 'SET', `eic:owner:${runId}`, runId, 'NX']);
  r.recoveredAt = new Date().toISOString(); r.state = 'ready'; save(root, r);
  const checked = status(runId, cwd); save(root, checked); return checked;
}
export function stop(runId, cwd = process.cwd()) {
  const r = status(runId, cwd); // No stop if identities cannot be independently verified.
  exec('pg_ctl', ['-D', path.join(r.root, 'pg'), '-w', '-m', 'fast', 'stop']);
  if (processStart(r.redisPid) !== r.redisStart) throw new Error('Redis identity changed');
  process.kill(r.redisPid, 'SIGTERM');
  r.state = 'stopped-retained'; r.stoppedAt = new Date().toISOString(); save(r.root, r);
  return r;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, id = crypto.randomUUID()] = process.argv.slice(2);
  try {
    const result = ['start', 'start-hold'].includes(action) ? await start(id) : action === 'status' ? status(id) : action === 'stop' ? stop(id) : action === 'recover-setup' ? recoverSetup(id) : null;
    if (!result) throw new Error('usage: node scripts/eic-local-infra.mjs start|status|stop [run UUID]');
    console.log(JSON.stringify(result, null, 2));
    if (action === 'start-hold') {
      const shutdown = () => { try { stop(id); process.exit(0); } catch { process.exit(1); } };
      process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
      setInterval(() => {}, 60_000); // An unresolved promise alone does not keep Node alive.
      await new Promise(() => {});
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}