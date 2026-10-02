import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addEvidenceFile, addOwnedArtifact, archiveEvidence, assertIsolation,
  mayDeleteRunMedia, redact, requireRealArtifacts, sha256, updateArchivedOutcome, type EvidenceRecord,
} from '../scripts/lib/eicValidation';
import { removeOwnedQueueJobStrict } from '../scripts/lib/investorMvpCleanup';
import { vi } from 'vitest';

const runId = '973d85c1-1a3f-4b4d-9499-752242653191';
const env = {
  DATABASE_URL: 'postgresql://local:local@127.0.0.1:15432/eic_disposable',
  REDIS_URL: 'redis://127.0.0.1:16379',
  MVP_BASE_URL: 'http://127.0.0.1:5000',
  R2_BUCKET: 'verified-separate-bucket',
  QUEUE_PREFIX: `sinna:eic:${runId}`,
};
const isolation = (cwd: string) => ({
  runId, verifiedAt: new Date().toISOString(),
  database: { kind: 'disposable-local', name: 'eic_disposable', verification: 'separate local database checked by operator' },
  queue: { kind: 'disposable-local', prefix: env.QUEUE_PREFIX, verification: 'separate local Redis namespace checked' },
  storage: { bucket: env.R2_BUCKET, nonProductionOwnershipVerified: true, verification: 'non-production owner confirmed out of band' },
  evidence: { directory: path.join(cwd, 'evidence/eic'), durableDestinationVerified: true, verification: 'workspace archive retention confirmed' },
});
const record = (outcome: EvidenceRecord['outcome']): EvidenceRecord => ({
  runId, preset: 'deaf', revision: 'abcdef', changesSha256: 'hash',
  startedAt: new Date().toISOString(), outcome, toolVersions: {}, configuration: {},
  logs: [{ at: new Date().toISOString(), event: 'test' }], files: {}, metrics: {}, cleanupFailures: [],
});

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});

describe('EIC isolation preflight', () => {
  it('blocks unknown or mismatched prerequisites without network access', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'eic-preflight-')); dirs.push(cwd);
    expect(() => assertIsolation(env, null, runId, cwd)).toThrow('isolation verification incomplete');
    expect(() => assertIsolation(env, { ...isolation(cwd), storage: { bucket: env.R2_BUCKET } }, runId, cwd))
      .toThrow('isolation verification incomplete');
    expect(() => assertIsolation({ ...env, REDIS_URL: 'redis://staging.example:6379' }, isolation(cwd), runId, cwd))
      .toThrow('identity mismatch');
    expect(() => assertIsolation({ ...env, R2_BUCKET: 'production' }, isolation(cwd), runId, cwd))
      .toThrow('ownership');
    expect(() => assertIsolation(env, { ...isolation(cwd), runId: 'different' }, runId, cwd))
      .toThrow('isolation verification incomplete');
    expect(assertIsolation(env, isolation(cwd), runId, cwd).queuePrefix).toBe(env.QUEUE_PREFIX);
  });

  it('does not authorize cross-run cleanup and contains no demo-wide sweep', async () => {
    const keys = new Set<string>();
    addOwnedArtifact(keys, 'artifacts/my-tenant/my-output.mp4', 'my-tenant');
    expect(() => addOwnedArtifact(keys, 'artifacts/other-tenant/my-output.mp4', 'my-tenant')).toThrow('not owned');
    expect(() => addOwnedArtifact(keys, 'artifacts/my-tenant/../other-tenant', 'my-tenant')).toThrow('not owned');
    expect([...keys]).toEqual(['artifacts/my-tenant/my-output.mp4']);
    const source = await fs.readFile(path.join(process.cwd(), 'scripts/investor-mvp-smoke.ts'), 'utf8');
    expect(source).not.toMatch(/removeStaleDemoState|DELETE FROM tenants WHERE name LIKE|deleteR2Prefix/);
    expect(source).toMatch(/DELETE FROM tenants WHERE id = \$1 AND name = \$2/);
  });
  it('retains remote media on ambiguous submission or unverified queue ownership', async () => {
    expect(mayDeleteRunMedia(true, true, false, true)).toBe(false);
    expect(mayDeleteRunMedia(true, true, true, false)).toBe(false);
    expect(mayDeleteRunMedia(false, false, false, true)).toBe(false);
    expect(mayDeleteRunMedia(true, true, true, true)).toBe(true);
    const foreign = { getJob: vi.fn().mockResolvedValue({ data: { tenantId: 'other-run' } }), remove: vi.fn() };
    await expect(removeOwnedQueueJobStrict(foreign as any, 'id', 'this-run')).rejects.toThrow('not owned');
    expect(foreign.remove).not.toHaveBeenCalled();
  });
});

describe('EIC evidence preservation', () => {
  it.each(['failed', 'interrupted'] as const)('retains and verifies %s evidence before disposal', async (outcome) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eic-evidence-')); dirs.push(root);
    const source = path.join(root, 'temporary');
    await fs.mkdir(source);
    const evidence = record(outcome);
    await addEvidenceFile(source, 'original-input.mp4', Buffer.from('synthetic media'), evidence);
    await addEvidenceFile(source, 'output-video.mp4', Buffer.from('downloaded bytes'), evidence);
    const stored = await archiveEvidence(source, path.join(root, 'archive'), evidence);
    const parsed = JSON.parse(await fs.readFile(path.join(stored, 'manifest.json'), 'utf8')) as EvidenceRecord;
    expect(parsed.outcome).toBe(outcome);
    expect(sha256(await fs.readFile(path.join(stored, 'output-video.mp4')))).toBe(evidence.files['output-video.mp4'].sha256);
    evidence.cleanupFailures.push('queue cleanup unavailable');
    await updateArchivedOutcome(stored, evidence);
    expect(JSON.parse(await fs.readFile(path.join(stored, 'manifest.json'), 'utf8')).cleanupFailures).toEqual(['queue cleanup unavailable']);
    await fs.rm(source, { recursive: true });
    expect(sha256(await fs.readFile(path.join(stored, 'output-video.mp4')))).toBe(evidence.files['output-video.mp4'].sha256);
  });

  it('does not discard recoverable source media when archiving fails', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eic-archive-failure-')); dirs.push(root);
    const source = path.join(root, 'temporary');
    await fs.mkdir(source);
    const evidence = record('failed');
    await addEvidenceFile(source, 'original-input.mp4', Buffer.from('keep me'), evidence);
    evidence.files['original-input.mp4'].sha256 = 'wrong-hash';
    await expect(archiveEvidence(source, path.join(root, 'archive'), evidence)).rejects.toThrow('hash mismatch');
    expect(await fs.readFile(path.join(source, 'original-input.mp4'), 'utf8')).toBe('keep me');
    expect(await fs.stat(path.join(root, 'archive', `${runId}.partial`))).toBeDefined();
  });
  it('keeps the last verified outcome when a final outcome update fails', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eic-final-failure-')); dirs.push(root);
    const source = path.join(root, 'temporary');
    await fs.mkdir(source);
    const evidence = record('interrupted');
    await addEvidenceFile(source, 'original-input.mp4', 'recoverable', evidence);
    const stored = await archiveEvidence(source, path.join(root, 'archive'), evidence);
    evidence.cleanupFailures.push('cleanup interrupted');
    await fs.writeFile(path.join(stored, 'manifest.next.json'), 'conflict');
    await expect(updateArchivedOutcome(stored, evidence)).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(path.join(stored, 'manifest.json'), 'utf8')).outcome).toBe('interrupted');
    expect(await fs.readFile(path.join(source, 'original-input.mp4'), 'utf8')).toBe('recoverable');
  });
});

describe('strict artifacts and redaction', () => {
  it('rejects missing, skipped, degraded and unowned artifacts', () => {
    const valid = Object.fromEntries(
      ['captions', 'ad', 'color', 'videoTransform'].map((name) => [
        name, { status: 'completed', degraded: false, artifactKey: `artifacts/a/${name}`, url: 'https://signed.example/object' },
      ]),
    );
    expect(() => requireRealArtifacts(valid, 'a')).not.toThrow();
    for (const invalid of [
      { captions: undefined },
      { ad: { ...valid.ad, status: 'skipped' } },
      { color: { ...valid.color, degraded: true } },
      { videoTransform: { ...valid.videoTransform, url: undefined } },
      { captions: { ...valid.captions, artifactKey: 'artifacts/b/captions' } },
    ]) {
      expect(() => requireRealArtifacts({ ...valid, ...invalid }, 'a')).toThrow('required');
    }
  });
  it('redacts signed URLs and keys from failures', () => {
    expect(redact('GET https://host/path?signature=sensitive sk_live_1234'))
      .not.toMatch(/sensitive|sk_live_1234/);
  });
});