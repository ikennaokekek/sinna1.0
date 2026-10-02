import { afterEach, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { assertRuntimeProof } from '../scripts/lib/eicRuntimeProof';
import { sha256, writeEvidenceJournal, recoverEvidenceJournal, verifyStorageOwnership, type EvidenceRecord } from '../scripts/lib/eicValidation';
const dirs: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited;
  }
  for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});
it('blocks unknown runtime receipts without making network calls', async () => {
  await expect(assertRuntimeProof({}, 'run', 'revision', '/workspace')).rejects.toThrow('receipt');
});
it('checks live PID, exact revisions, resource bindings and compiled-byte hashes', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'eic-runtime-proof-')); dirs.push(cwd);
  const runId = 'b49f523d-8736-45ad-8873-86e051e53c96';
  const file = path.join(cwd, 'evidence/eic-local/mock/runtime.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const env = { DATABASE_URL: 'postgresql://fixture@127.0.0.1:15432/fixture',
    REDIS_URL: 'redis://127.0.0.1:16379', QUEUE_PREFIX: `sinna:eic:${runId}`,
    R2_BUCKET: 'fixture-not-real', R2_ACCOUNT_ID: 'fixture-not-real', MVP_RUNTIME_RECEIPT: file,
    EIC_RUN_ID: runId, EIC_REVISION: 'revision' };
  const receipt: any = { runId, revision: 'revision', mode: 'real', localResourceRunId: runId, queuePrefix: env.QUEUE_PREFIX };
  for (const role of ['api', 'worker']) {
    const source = path.join(cwd, 'apps', role, 'dist', 'index.js');
    await fs.mkdir(path.dirname(source), { recursive: true });
    const script = 'setInterval(()=>{},1000)';
    await fs.writeFile(source, script);
    const child = spawn(process.execPath, [source], { env, stdio: 'ignore' }); children.push(child);
    receipt[role] = { pid: child.pid, startTime: (await fs.readFile(`/proc/${child.pid}/stat`, 'utf8')).split(') ').at(-1)!.split(' ')[19],
      buildHashes: { [path.relative(cwd, source)]: sha256(script) } };
  }
  await fs.writeFile(file, JSON.stringify(receipt));
  await expect(assertRuntimeProof(env, runId, 'revision', cwd)).resolves.toMatchObject({ mode: 'real' });
  await expect(assertRuntimeProof(env, runId, 'different-revision', cwd)).rejects.toThrow('revision');
  await expect(assertRuntimeProof({ ...env, REDIS_URL: 'redis://127.0.0.1:1' }, runId, 'revision', cwd)).rejects.toThrow('identity mismatch');
  receipt.api.startTime = '0'; await fs.writeFile(file, JSON.stringify(receipt));
  await expect(assertRuntimeProof(env, runId, 'revision', cwd)).rejects.toThrow('PID was reused');
  receipt.api.startTime = (await fs.readFile(`/proc/${receipt.api.pid}/stat`, 'utf8')).split(') ').at(-1)!.split(' ')[19];
  await fs.writeFile(file, JSON.stringify(receipt));
  await fs.appendFile(path.join(cwd, 'apps/api/dist/index.js'), '\n// changed');
  await expect(assertRuntimeProof(env, runId, 'revision', cwd)).rejects.toThrow('hash mismatch');
});
it('durably records interrupted and blocked journals independently of disposable media', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eic-journal-')); dirs.push(root);
  const r: EvidenceRecord = { runId: 'b49f523d-8736-45ad-8873-86e051e53c96', preset: 'deaf', revision: 'fixture',
    changesSha256: 'fixture', startedAt: new Date().toISOString(), toolVersions: {}, configuration: {},
    logs: [], files: {}, metrics: {}, outcome: 'interrupted', cleanupFailures: ['fixture failure'] };
  const file = writeEvidenceJournal(root, r);
  expect(JSON.parse(await fs.readFile(file, 'utf8')).outcome).toBe('interrupted');
  r.outcome = 'blocked'; writeEvidenceJournal(root, r);
  expect(JSON.parse(await fs.readFile(file, 'utf8')).outcome).toBe('blocked');
});
it('recovers an unfinished attempt into a verified archive without deleting original media', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'eic-recover-')); dirs.push(cwd);
  const source = await fs.mkdtemp('/tmp/sinna-investor-mvp-'); dirs.push(source);
  await fs.writeFile(path.join(source, 'original-input.mp4'), 'fixture bytes');
  const r: EvidenceRecord = { runId: 'b49f523d-8736-45ad-8873-86e051e53c96', preset: 'deaf', revision: 'fixture',
    changesSha256: 'fixture', startedAt: new Date().toISOString(), toolVersions: {}, configuration: {},
    logs: [], files: { 'original-input.mp4': { sha256: sha256('fixture bytes'), bytes: 13 } },
    metrics: {}, outcome: 'running', cleanupFailures: [], recovery: { tempDir: source } };
  const journal = writeEvidenceJournal(path.join(cwd, 'evidence/eic'), r);
  const archive = await recoverEvidenceJournal(journal, cwd);
  expect(JSON.parse(await fs.readFile(path.join(archive, 'manifest.json'), 'utf8')).outcome).toBe('interrupted');
  expect(await fs.readFile(path.join(source, 'original-input.mp4'), 'utf8')).toBe('fixture bytes');
});
it('requires ownership/access records with matching independently supplied document hashes', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'eic-ownership-')); dirs.push(cwd);
  const root = path.join(cwd, 'evidence/eic'); await fs.mkdir(root, { recursive: true });
  const evidence = path.join(root, 'fixture-owner-document.txt'); await fs.writeFile(evidence, 'offline fixture; NOT a real attestation');
  const file = path.join(root, 'ownership.json');
  const env = { R2_BUCKET: 'fixture-not-real', R2_ACCOUNT_ID: 'fixture-not-real' };
  const proof = { environment: 'validation', nonProductionOwnershipVerified: true, productionUsageExcluded: true,
    verifiedAt: new Date().toISOString(), bucketSha256: sha256(env.R2_BUCKET), accountSha256: sha256(env.R2_ACCOUNT_ID),
    verification: 'offline mechanism test, never real ownership proof', permissions: ['read', 'write', 'delete'],
    stableEvidenceReferences: [{ path: evidence, sha256: sha256('offline fixture; NOT a real attestation') }] };
  await expect(verifyStorageOwnership(env, undefined, cwd)).rejects.toThrow('document required');
  await fs.writeFile(file, JSON.stringify(proof));
  await expect(verifyStorageOwnership(env, file, cwd)).resolves.toMatchObject({ evidenceReferenceCount: 1 });
  await fs.appendFile(evidence, 'changed');
  await expect(verifyStorageOwnership(env, file, cwd)).rejects.toThrow('hash mismatch');
  proof.productionUsageExcluded = false; await fs.writeFile(file, JSON.stringify(proof));
  await expect(verifyStorageOwnership(env, file, cwd)).rejects.toThrow('incomplete');
});