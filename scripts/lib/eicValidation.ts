import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mkdirSync, realpathSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, readFileSync } from 'node:fs';

export type EvidenceRecord = {
  runId: string;
  preset: string;
  startedAt: string;
  finishedAt?: string;
  revision: string;
  changesSha256: string;
  toolVersions: Record<string, string>;
  configuration: Record<string, string>;
  logs: Array<{ at: string; event: string }>;
  files: Record<string, { sha256: string; bytes: number }>;
  metrics: Record<string, unknown>;
  outcome: 'running' | 'passed' | 'failed' | 'interrupted' | 'blocked';
  technicalFailure?: string;
  cleanupFailures: string[];
  protocol?: { version: string; sha256: string };
  assertions?: Array<{ id: string; status: string; detail?: unknown }>;
  stepClassifications?: Record<string, string>;
  recovery?: Record<string, unknown>;
};

type Isolation = {
  runId: string;
  verifiedAt: string;
  database: { kind: 'disposable-local'; name: string; verification: string };
  queue: { kind: 'disposable-local'; prefix: string; verification: string };
  storage: { bucket: string; nonProductionOwnershipVerified: true; verification: string };
  evidence: { directory: string; durableDestinationVerified: true; verification: string };
};

const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
const verified = (text: unknown) => typeof text === 'string' && text.trim().length >= 12;

// An operator must verify resource ownership independently and record how it was
// checked. Names or credentials alone do not attest to isolation.
export function assertIsolation(env: NodeJS.ProcessEnv, raw: unknown, runId: string, cwd: string): {
  queuePrefix: string;
  evidenceDirectory: string;
  databaseName: string;
  bucket: string;
} {
  const config = raw as Isolation | null;
  if (!config || config.runId !== runId
    || !verified(config.verifiedAt) || !Number.isFinite(Date.parse(config.verifiedAt))
    || Math.abs(Date.now() - Date.parse(config.verifiedAt)) > 24 * 60 * 60 * 1000
    || !config.database || !config.queue || !config.storage || !config.evidence
    || config.database.kind !== 'disposable-local' || !verified(config.database.verification)
    || config.queue.kind !== 'disposable-local' || !verified(config.queue.verification)
    || config.storage.nonProductionOwnershipVerified !== true || !verified(config.storage.verification)
    || config.evidence.durableDestinationVerified !== true || !verified(config.evidence.verification)) {
    throw new Error('isolation verification incomplete; no external resources were accessed');
  }
  let db: URL;
  let redis: URL;
  let base: URL;
  try {
    db = new URL(env.DATABASE_URL || '');
    redis = new URL(env.REDIS_URL || '');
    base = new URL(env.MVP_BASE_URL || '');
  } catch {
    throw new Error('local database, Redis and API URLs must be explicitly configured');
  }
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !loopback.has(db.hostname)
    || !['redis:'].includes(redis.protocol) || !loopback.has(redis.hostname)
    || !['http:'].includes(base.protocol) || !loopback.has(base.hostname)
    || decodeURIComponent(db.pathname.slice(1)) !== config.database.name
    || !/^[a-z][a-z0-9_]{2,62}$/.test(config.database.name)
    || config.database.name === 'postgres') {
    throw new Error('disposable local database, Redis and API identity mismatch');
  }
  if (config.queue.prefix !== env.QUEUE_PREFIX || config.queue.prefix !== `sinna:eic:${runId}`) {
    throw new Error('queue prefix must be unique to this run and match the API and worker');
  }
  if (!config.storage.bucket || config.storage.bucket !== env.R2_BUCKET) {
    throw new Error('non-production storage ownership is not verified for the configured bucket');
  }
  const directory = path.resolve(config.evidence.directory);
  const root = path.resolve(cwd);
  if (directory !== path.join(root, 'evidence', 'eic')
    || directory.startsWith(path.join(root, 'tmp') + path.sep)
    || directory.includes(`${path.sep}node_modules${path.sep}`)) {
    throw new Error('evidence destination must be a dedicated persistent workspace directory');
  }
  return {
    queuePrefix: config.queue.prefix,
    evidenceDirectory: directory,
    databaseName: config.database.name,
    bucket: config.storage.bucket,
  };
}

export function sha256(bytes: Uint8Array | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function writeEvidenceJournal(root: string, record: EvidenceRecord): string {
  if (!/^[0-9a-f-]{36}$/i.test(record.runId)) throw new Error('journal run identity invalid');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (realpathSync(root) !== path.resolve(root)) throw new Error('symlinked evidence directory refused');
  const directory = path.join(root, `attempt-${record.runId}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (realpathSync(directory) !== directory) throw new Error('symlinked attempt directory refused');
  const file = path.join(directory, 'journal.json');
  const temporary = `${file}.next`;
  const data = JSON.stringify(record, null, 2) + '\n';
  const fd = openSync(temporary, 'w', 0o600);
  try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, file);
  const parent = openSync(directory, 'r');
  try { fsyncSync(parent); } finally { closeSync(parent); }
  if (sha256(readFileSync(file)) !== sha256(data)) throw new Error('durable journal read-back failed');
  return file;
}

export function redact(message: unknown): string {
  return String(message)
    .replace(/(?:https?|postgres(?:ql)?|redis):\/\/\S+/gi, '[redacted-url]')
    .replace(/sk_(?:live|test)_[A-Za-z0-9]+/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [redacted]')
    .replace(/(?:api[_-]?key|secret|token|signature)\s*[=:]\s*\S+/gi, '[redacted-credential]');
}

export function numericMeasurements(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.map(numericMeasurements).filter((v) => v !== undefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, numericMeasurements(item)])
        .filter(([, item]) => item !== undefined),
    );
  }
  return undefined;
}

export async function verifyStorageOwnership(env: NodeJS.ProcessEnv, file: string | undefined, cwd: string) {
  const root = path.join(cwd, 'evidence', 'eic');
  if (!file || !path.resolve(file).startsWith(root + path.sep)) throw new Error('private independent non-production storage ownership document required');
  if (await fs.realpath(file) !== path.resolve(file)) throw new Error('symlinked ownership proof refused');
  const bytes = await fs.readFile(file);
  const proof = JSON.parse(bytes.toString());
  if (!env.R2_BUCKET || !env.R2_ACCOUNT_ID || proof.environment !== 'validation'
    || proof.nonProductionOwnershipVerified !== true || proof.productionUsageExcluded !== true
    || proof.bucketSha256 !== sha256(env.R2_BUCKET) || proof.accountSha256 !== sha256(env.R2_ACCOUNT_ID)
    || typeof proof.verification !== 'string' || proof.verification.length < 24
    || !['read', 'write', 'delete'].every(permission => proof.permissions?.includes(permission))
    || !Number.isFinite(Date.parse(proof.verifiedAt)) || Math.abs(Date.now() - Date.parse(proof.verifiedAt)) > 7 * 86400_000
    || !Array.isArray(proof.stableEvidenceReferences) || !proof.stableEvidenceReferences.length) {
    throw new Error('storage ownership/separation/access evidence is incomplete');
  }
  for (const reference of proof.stableEvidenceReferences) {
    if (typeof reference.path !== 'string' || !path.resolve(reference.path).startsWith(root + path.sep)
      || await fs.realpath(reference.path) !== path.resolve(reference.path)
      || sha256(await fs.readFile(reference.path)) !== reference.sha256) {
      throw new Error('independent ownership evidence reference/hash mismatch');
    }
  }
  return { sha256: sha256(bytes), evidenceReferenceCount: proof.stableEvidenceReferences.length };
}

export function requireRealArtifacts(
  steps: Record<string, { status?: string; artifactKey?: string; url?: string; degraded?: boolean }> | undefined,
  tenantId: string,
  required: readonly string[] = ['captions', 'ad', 'color', 'videoTransform'],
): void {
  for (const name of required) {
    const step = steps?.[name];
    if (step?.status !== 'completed' || step.degraded !== false
      || !step.artifactKey?.startsWith(`artifacts/${tenantId}/`)
      || !step.url) {
      throw new Error(`required ${name} artifact is missing, degraded, stubbed, or outside the tenant`);
    }
  }
}

export function addOwnedArtifact(keys: Set<string>, key: string | undefined, tenantId: string): void {
  if (!key) return;
  if (!key.startsWith(`artifacts/${tenantId}/`) || key.includes('..')) {
    throw new Error('returned artifact is not owned by this run tenant');
  }
  keys.add(key);
}

export function mayDeleteRunMedia(
  archiveVerified: boolean,
  submissionAttempted: boolean,
  jobStepsKnown: boolean,
  queueStateRemoved: boolean,
): boolean {
  return archiveVerified && queueStateRemoved && (!submissionAttempted || jobStepsKnown);
}

export async function addEvidenceFile(dir: string, name: string, bytes: Uint8Array | string, record: EvidenceRecord): Promise<void> {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(name)) throw new Error('invalid evidence filename');
  const data = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes);
  await fs.writeFile(path.join(dir, name), data, { flag: 'wx', mode: 0o600 });
  record.files[name] = { sha256: sha256(data), bytes: data.length };
}

async function syncFile(file: string) {
  const handle = await fs.open(file, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(directory: string) {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

// Copy and read back every byte before caller may remove disposable media.
// On failure the source and partial archive are deliberately left intact.
export async function archiveEvidence(source: string, destination: string, record: EvidenceRecord): Promise<string> {
  const final = path.join(destination, record.runId);
  const partial = `${final}.partial`;
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  await fs.mkdir(partial, { mode: 0o700 });
  for (const [name, expected] of Object.entries(record.files)) {
    const original = await fs.readFile(path.join(source, name));
    if (sha256(original) !== expected.sha256 || original.length !== expected.bytes) {
      throw new Error(`source evidence hash mismatch: ${name}`);
    }
    await fs.writeFile(path.join(partial, name), original, { flag: 'wx', mode: 0o600 });
    await syncFile(path.join(partial, name));
    const stored = await fs.readFile(path.join(partial, name));
    if (sha256(stored) !== expected.sha256 || stored.length !== expected.bytes) {
      throw new Error(`archived evidence hash mismatch: ${name}`);
    }
  }
  const manifest = JSON.stringify(record, null, 2) + '\n';
  await fs.writeFile(path.join(partial, 'manifest.json'), manifest, { flag: 'wx', mode: 0o600 });
  await syncFile(path.join(partial, 'manifest.json'));
  if (sha256(await fs.readFile(path.join(partial, 'manifest.json'))) !== sha256(manifest)) {
    throw new Error('archived manifest hash mismatch');
  }
  await syncDirectory(partial);
  await fs.rename(partial, final);
  await syncDirectory(destination);
  return final;
}

export async function updateArchivedOutcome(dir: string, record: EvidenceRecord): Promise<void> {
  const file = path.join(dir, 'manifest.json');
  const tmp = path.join(dir, 'manifest.next.json');
  const data = JSON.stringify(record, null, 2) + '\n';
  await fs.writeFile(tmp, data, { flag: 'wx', mode: 0o600 });
  await syncFile(tmp);
  if (sha256(await fs.readFile(tmp)) !== sha256(data)) throw new Error('final manifest verification failed');
  await fs.rename(tmp, file);
  await syncDirectory(dir);
  if (sha256(await fs.readFile(file)) !== sha256(data)) throw new Error('final archived manifest read-back failed');
}

export async function recoverEvidenceJournal(journal: string, cwd: string): Promise<string> {
  const root = path.join(cwd, 'evidence', 'eic');
  const resolved = await fs.realpath(journal);
  if (!resolved.startsWith(root + path.sep)) throw new Error('recovery journal must be in private workspace evidence');
  const record = JSON.parse(await fs.readFile(resolved, 'utf8')) as EvidenceRecord;
  if (path.basename(path.dirname(resolved)) !== `attempt-${record.runId}`) throw new Error('recovery run identity mismatch');
  const source = record.recovery?.tempDir;
  if (typeof source !== 'string' || !/^\/tmp\/sinna-investor-mvp-[a-zA-Z0-9]+$/.test(source)
    || await fs.realpath(source) !== source) throw new Error('owned recovery media path is unknown');
  const originalRunId = record.runId;
  record.runId = crypto.randomUUID();
  record.recovery = { ...record.recovery, originalRunId, journalSha256: sha256(await fs.readFile(resolved)) };
  if (record.outcome === 'running') record.outcome = 'interrupted';
  record.finishedAt ||= new Date().toISOString();
  const saved = await archiveEvidence(source, path.join(root, 'recovered'), record);
  // This operation deliberately never removes source, prior archives or remote resources.
  return saved;
}