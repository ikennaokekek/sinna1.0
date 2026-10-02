import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './eicValidation';

export async function assertRuntimeProof(env: NodeJS.ProcessEnv, runId: string, revision: string, cwd: string, allowLocalOnly = false) {
  const file = env.MVP_RUNTIME_RECEIPT;
  if (!file || !path.resolve(file).startsWith(path.join(cwd, 'evidence', 'eic-local') + path.sep)) {
    throw new Error('verified API/worker runtime receipt is required');
  }
  const receipt = JSON.parse(await fs.readFile(file, 'utf8'));
  if (receipt.runId !== runId || receipt.revision !== revision || (!allowLocalOnly && receipt.mode !== 'real')
    || receipt.queuePrefix !== env.QUEUE_PREFIX || receipt.localResourceRunId !== runId) {
    throw new Error('runtime revision/isolation mismatch or local-only runtime');
  }
  for (const role of ['api', 'worker']) {
    const runtime = receipt[role];
    if (!runtime || !Number.isInteger(runtime.pid) || runtime.pid < 2) throw new Error('runtime PID missing');
    const stat = (await fs.readFile(`/proc/${runtime.pid}/stat`, 'utf8')).split(') ').at(-1)!.split(' ')[19];
    if (stat !== runtime.startTime) throw new Error('runtime PID was reused');
    const argv = (await fs.readFile(`/proc/${runtime.pid}/cmdline`, 'utf8')).split('\0');
    if (!argv.includes(path.join(cwd, 'apps', role, 'dist', 'index.js'))) throw new Error('unexpected runtime executable');
    const actualEnv = Object.fromEntries((await fs.readFile(`/proc/${runtime.pid}/environ`, 'utf8'))
      .split('\0').filter(Boolean).map(item => { const i = item.indexOf('='); return [item.slice(0, i), item.slice(i + 1)]; }));
    for (const key of ['DATABASE_URL', 'REDIS_URL', 'QUEUE_PREFIX', ...(receipt.mode === 'real' ? ['R2_BUCKET', 'R2_ACCOUNT_ID'] : [])]) {
      if (!env[key] || actualEnv[key] !== env[key]) throw new Error(`runtime ${role} ${key} identity mismatch`);
    }
    if (actualEnv.EIC_RUN_ID !== runId || actualEnv.EIC_REVISION !== revision) throw new Error('runtime validation identity mismatch');
    const entries = Object.entries(runtime.buildHashes || {});
    if (!entries.length) throw new Error('runtime build evidence missing');
    for (const [relative, expected] of entries) {
      const resolved = path.resolve(cwd, relative);
      if (!resolved.startsWith(path.join(cwd, 'apps', role, 'dist') + path.sep)
        || sha256(await fs.readFile(resolved)) !== expected) throw new Error('runtime build hash mismatch');
    }
  }
  return { receiptSha256: sha256(await fs.readFile(file)), revision, mode: receipt.mode };
}