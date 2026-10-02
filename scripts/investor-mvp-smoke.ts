#!/usr/bin/env tsx

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { getDb } from '../apps/api/src/lib/db';
import { removeOwnedQueueJobStrict } from './lib/investorMvpCleanup';
import {
  addEvidenceFile, addOwnedArtifact, archiveEvidence, assertIsolation, redact, requireRealArtifacts,
  mayDeleteRunMedia, numericMeasurements, sha256, updateArchivedOutcome, writeEvidenceJournal, verifyStorageOwnership, type EvidenceRecord,
} from './lib/eicValidation';
import { EIC_PROTOCOL, protocolSha256, inspectCaptions } from './lib/eicProtocol';
import { assertRuntimeProof } from './lib/eicRuntimeProof';

type JobStatus = {
  success?: boolean;
  data?: {
    id?: string;
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    steps?: Record<string, {
      status?: string;
      artifactKey?: string;
      url?: string;
      degraded?: boolean;
      evidenceArtifactKey?: string;
      evidenceUrl?: string;
    }>;
  };
};

const baseUrl = (process.env.MVP_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const GOLDEN_PRESETS = ['deaf', 'epilepsy_flash', 'epilepsy_noise'] as const;
type GoldenPreset = typeof GOLDEN_PRESETS[number];
let activeRecord: EvidenceRecord | undefined;
const journalRoot = path.join(process.cwd(), 'evidence', 'eic');
const checkpoint = () => activeRecord && writeEvidenceJournal(journalRoot, activeRecord);
const attemptStartedAt = new Date().toISOString();
const required = [
  'DATABASE_URL',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'ASSEMBLYAI_API_KEY',
] as const;

function assertEnvironment(): void {
  for (const name of required) {
    if (!process.env[name]?.trim()) throw new Error(`${name} is required`);
  }
}

function selectedPreset(): GoldenPreset {
  const value = process.argv[2] || 'deaf';
  if (!GOLDEN_PRESETS.includes(value as GoldenPreset)) {
    throw new Error(`preset must be one of: ${GOLDEN_PRESETS.join(', ')}`);
  }
  return value as GoldenPreset;
}

function generateRepresentativeInput(preset: GoldenPreset, outputPath: string): void {
  const outputArgs = [
    '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k',
    outputPath,
  ];
  if (preset === 'epilepsy_flash') {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i',
      "nullsrc=s=640x360:r=30:d=8,geq=lum='if(lt(mod(T\\,0.16)\\,0.08)\\,16\\,235)':cb=128:cr=128",
      '-f', 'lavfi', '-i',
      "flite=text='This synthetic demonstration contains rapid alternating luminance for engineering measurement.'",
      ...outputArgs,
    ]);
    return;
  }
  if (preset === 'epilepsy_noise') {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=0x111827:s=640x360:r=24:d=8',
      '-f', 'lavfi', '-i',
      "flite=text='This synthetic demonstration mixes intelligible speech with abrupt audio peaks and dynamic swings.'",
      '-f', 'lavfi', '-i', 'sine=frequency=2200:sample_rate=48000:duration=8',
      '-filter_complex',
      "[1:a]volume='if(lt(t\\,2)\\,0.03\\,if(lt(t\\,4)\\,1.6\\,if(lt(t\\,6)\\,0.08\\,1)))':eval=frame[speech];[2:a]volume='if(lt(mod(t\\,1)\\,0.025)\\,14\\,0.02)':eval=frame[transients];[speech][transients]amix=inputs=2:duration=longest:normalize=0[a]",
      '-map', '0:v', '-map', '[a]',
      ...outputArgs,
    ]);
    return;
  }
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=0x111827:s=640x360:r=24:d=7',
    '-f', 'lavfi', '-i',
    "flite=text='Welcome to the SINNA accessibility demonstration. Real captions make video available to more people.'",
    ...outputArgs,
  ]);
}

function validateEngineeringEvidence(preset: GoldenPreset, evidence: any): void {
  if (preset === 'epilepsy_flash') {
    if (
      evidence?.kind !== 'flash-risk-proxy'
      || !(evidence.after?.maxLuminanceDelta < evidence.before?.maxLuminanceDelta)
      || !(evidence.after?.rapidHighDeltaTransitions < evidence.before?.rapidHighDeltaTransitions)
    ) {
      throw new Error(`flash-risk proxy did not measurably improve: ${JSON.stringify(evidence)}`);
    }
  }
  if (preset === 'epilepsy_noise') {
    if (
      evidence?.kind !== 'audio-dynamics'
      || !(evidence.after?.maxPeakDbfs < evidence.before?.maxPeakDbfs)
      || !(evidence.after?.shortWindowRmsRangeDb < evidence.before?.shortWindowRmsRangeDb)
      || evidence.before?.sampleRateHz !== 48_000
      || evidence.after?.sampleRateHz !== 48_000
      || evidence.before?.windowDurationMs !== 100
      || evidence.after?.windowDurationMs !== 100
      || evidence.before?.sampledAudioWindows !== evidence.after?.sampledAudioWindows
      || !Number.isFinite(evidence?.encodedTruePeakDbtp)
      || evidence.encodedTruePeakCeilingDbtp !== -2
      || !(evidence.before?.sampledAudioWindows > 0)
      || !(evidence.encodedTruePeakDbtp <= evidence.encodedTruePeakCeilingDbtp)
      || evidence.after?.truePeakDbtp !== evidence.encodedTruePeakDbtp
    ) {
      throw new Error(`audio dynamics did not measurably improve: ${JSON.stringify(evidence)}`);
    }
  }
}

function inspectPlayableEpilepsyNoiseOutput(outputPath: string): {
  durationSeconds: number;
  sampleRateHz: number;
  truePeakDbtp: number;
} {
  const probe = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name,sample_rate',
    '-show_entries', 'format=duration',
    '-of', 'json',
    outputPath,
  ], { encoding: 'utf8' }));
  const video = probe.streams?.find((stream: any) => stream.codec_type === 'video');
  const audio = probe.streams?.find((stream: any) => stream.codec_type === 'audio');
  const durationSeconds = Number(probe.format?.duration);
  const sampleRateHz = Number(audio?.sample_rate);
  if (!video || audio?.codec_name !== 'aac' || sampleRateHz !== 48_000 || !(durationSeconds > 0)) {
    throw new Error(`retrieved epilepsy_noise output is not playable 48 kHz AAC/MP4: ${JSON.stringify(probe)}`);
  }

  const measured = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats',
    '-i', outputPath,
    '-map', '0:a:0',
    '-af', 'loudnorm=I=-18:LRA=7:TP=-2:print_format=json',
    '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (measured.status !== 0) {
    throw new Error(`post-download true-peak measurement failed: ${measured.stderr}`);
  }
  const matches = [...measured.stderr.matchAll(/"input_tp"\s*:\s*"(-?(?:\d+(?:\.\d+)?|inf))"/g)];
  const truePeakDbtp = Number(matches.at(-1)?.[1]);
  if (!Number.isFinite(truePeakDbtp)) {
    throw new Error('post-download true-peak measurement returned no finite result');
  }
  return { durationSeconds, sampleRateHz, truePeakDbtp };
}

function inspectMedia(pathname: string): { durationSeconds: number; videoStreams: number; audioStreams: number } {
  const probe = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type', '-show_entries', 'format=duration',
    '-of', 'json', pathname,
  ], { encoding: 'utf8' }));
  const result = {
    durationSeconds: Number(probe.format?.duration),
    videoStreams: (probe.streams || []).filter((s: { codec_type: string }) => s.codec_type === 'video').length,
    audioStreams: (probe.streams || []).filter((s: { codec_type: string }) => s.codec_type === 'audio').length,
  };
  if (!(result.durationSeconds > 0) || !result.videoStreams || !result.audioStreams) {
    throw new Error('media probe did not verify playable audio and video');
  }
  return result;
}

async function checkedJson(response: Response, operation: string): Promise<any> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${operation} failed with HTTP ${response.status}`);
  }
  return body;
}

async function createRunTenant(name: string, keyHash: string): Promise<string> {
  const client = await getDb().pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tenants(name, active, plan) VALUES ($1, true, 'standard') RETURNING id`,
      [name],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error('run tenant was not inserted');
    await client.query('INSERT INTO api_keys(key_hash, tenant_id) VALUES ($1, $2)', [keyHash, id]);
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const preset = selectedPreset();
  const runId = process.env.MVP_RUN_ID;
  if (!runId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    throw new Error('MVP_RUN_ID must be an explicitly assigned fresh UUID');
  }
  if (!process.env.MVP_ISOLATION_MANIFEST) {
    throw new Error('MVP_ISOLATION_MANIFEST is required before any resource access');
  }
  const isolation = assertIsolation(
    process.env,
    JSON.parse(await fs.readFile(process.env.MVP_ISOLATION_MANIFEST, 'utf8')),
    runId,
    process.cwd(),
  );
  // Refuse symlinked, missing or unwritable evidence destinations before
  // accessing any configured DB, queue, object store or media provider.
  if (await fs.realpath(isolation.evidenceDirectory) !== isolation.evidenceDirectory) {
    throw new Error('evidence directory must not be a symlink');
  }
  const probePath = path.join(isolation.evidenceDirectory, `.write-probe-${runId}`);
  await fs.writeFile(probePath, runId, { flag: 'wx', mode: 0o600 });
  try {
    if (await fs.readFile(probePath, 'utf8') !== runId) throw new Error('evidence read-back probe failed');
  } finally {
    await fs.unlink(probePath);
  }
  assertEnvironment();
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const trackedDiff = execFileSync('git', ['diff', '--binary', 'HEAD'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const changes = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' });
  if (changes.trim()) throw new Error('commit all validation code and inputs before execution so the tested revision is exact');
  const runtime = await assertRuntimeProof(process.env, runId, revision, process.cwd());
  const localIdentity = JSON.parse(execFileSync('node', ['scripts/eic-local-infra.mjs', 'status', runId], { encoding: 'utf8' }));
  if (localIdentity.database !== isolation.databaseName
    || new URL(process.env.DATABASE_URL!).port !== String(localIdentity.postgresPort)
    || new URL(process.env.REDIS_URL!).port !== String(localIdentity.redisPort)) {
    throw new Error('live disposable infrastructure identity mismatch');
  }
  // Ownership documentation must be independently supplied; no credential/name inference.
  const ownership = await verifyStorageOwnership(process.env, process.env.MVP_STORAGE_OWNERSHIP_DOCUMENT, process.cwd());
  const record: EvidenceRecord = {
    runId, preset, startedAt: attemptStartedAt, revision,
    changesSha256: sha256(trackedDiff + changes),
    toolVersions: {
      node: process.version,
      ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0],
      ffprobe: execFileSync('ffprobe', ['-version'], { encoding: 'utf8' }).split('\n')[0],
    },
    configuration: {
      database: 'verified disposable loopback database',
      redis: 'verified disposable loopback Redis',
      queuePrefix: isolation.queuePrefix,
      storage: 'operator-verified non-production bucket',
      evidence: 'operator-verified workspace archive',
      input: process.env.MVP_INPUT_MANIFEST ? 'permissioned representative media' : 'synthetic FFmpeg fixture',
      isolationManifestSha256: sha256(await fs.readFile(process.env.MVP_ISOLATION_MANIFEST)),
      runtimeReceiptSha256: runtime.receiptSha256,
      storageOwnershipDocumentSha256: ownership.sha256,
    },
    logs: [], files: {}, metrics: {}, outcome: 'running', cleanupFailures: [],
    protocol: { version: EIC_PROTOCOL.version, sha256: protocolSha256 },
    assertions: [], stepClassifications: { ad: EIC_PROTOCOL.disabledSteps.ad },
  };
  activeRecord = record; checkpoint();
  const apiKey = `sk_live_${crypto.randomBytes(16).toString('hex')}`;
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const otherApiKey = `sk_live_${crypto.randomBytes(16).toString('hex')}`;
  const otherApiKeyHash = crypto.createHash('sha256').update(otherApiKey).digest('hex');
  const tenantName = `investor-mvp-${runId}-a@example.invalid`;
  const otherTenantName = `investor-mvp-${runId}-b@example.invalid`;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sinna-investor-mvp-'));
  record.recovery = { tempDir, tenantNames: [tenantName, otherTenantName] }; checkpoint();
  const inputPath = path.join(tempDir, 'input.mp4');
  const inputKey = `demo-inputs/${runId}.mp4`;
  const artifactKeys = new Set<string>();
  let tenantId: string | undefined;
  let otherTenantId: string | undefined;
  let otherArtifactKey: string | undefined;
  let signedSourceUrl: string | undefined;
  let jobSteps: Record<string, string> = {};
  let smokePassed = false;
  let submissionAttempted = false;
  let knownJobId: string | undefined;
  let preserveRemoteEvidence = false;
  let inputUploadAttempted = false;
  let inputUploadConfirmed = false;
  let technicalFailure: string | undefined;
  let archivedAt: string | undefined;
  const interruption = new AbortController();
  const interrupted = (signal: string) => {
    record.outcome = 'interrupted'; record.technicalFailure = signal; checkpoint();
    interruption.abort(new Error(signal));
  };
  const onSigint = () => interrupted('SIGINT');
  const onSigterm = () => interrupted('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  const log = (event: string) => {
    record.logs.push({ at: new Date().toISOString(), event: redact(event) });
    checkpoint();
    console.log(redact(event));
  };

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const bucket = process.env.R2_BUCKET!;

  try {
    const runtimeSnapshot = await fs.readFile(process.env.MVP_RUNTIME_RECEIPT!);
    if (sha256(runtimeSnapshot) !== runtime.receiptSha256) throw new Error('runtime receipt changed during preflight');
    await addEvidenceFile(tempDir, 'runtime-identity-receipt.json', runtimeSnapshot, record);
    await addEvidenceFile(tempDir, 'validation-protocol.json', JSON.stringify(EIC_PROTOCOL, null, 2), record);
    checkpoint();
    // Read-only access proof before uploading anything or provisioning tenants.
    await r2.send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal: interruption.signal });
    record.assertions!.push({ id: 'storage-read-access', status: 'PASSED' });
    if (process.env.MVP_INPUT_MANIFEST) {
      const manifest = JSON.parse(await fs.readFile(process.env.MVP_INPUT_MANIFEST, 'utf8'));
      if (!manifest?.path || !/^[a-f0-9]{64}$/.test(manifest.sha256)
        || typeof manifest.permissionEvidence !== 'string' || manifest.permissionEvidence.trim().length < 12) {
        throw new Error('representative media requires a path, SHA-256 and permission evidence');
      }
      const source = path.resolve(manifest.path);
      if (!source.startsWith(process.cwd() + path.sep)) throw new Error('representative media must be in the workspace');
      const media = await fs.readFile(source);
      if (sha256(media) !== manifest.sha256) throw new Error('representative input SHA-256 mismatch');
      await fs.writeFile(inputPath, media);
      record.configuration.inputManifestSha256 = sha256(JSON.stringify(manifest));
      await addEvidenceFile(tempDir, 'input-permissions.json', JSON.stringify({
        sha256: manifest.sha256, permissionEvidence: redact(manifest.permissionEvidence),
        environmentCase: manifest.environmentCase || 'NOT_SUPPLIED',
        expectedTranscript: manifest.expectedTranscript || 'NOT_SUPPLIED',
      }, null, 2), record);
      log('Permissioned representative input hash verified');
    } else {
      generateRepresentativeInput(preset, inputPath);
      log('Synthetic input created');
    }

    const input = await fs.readFile(inputPath);
    await addEvidenceFile(tempDir, 'original-input.mp4', input, record);
    record.metrics.inputMedia = inspectMedia(inputPath);
    record.assertions!.push({ id: 'representative-environment', status:
      process.env.MVP_INPUT_MANIFEST ? 'PENDING_INDEPENDENT_REVIEW' : 'NOT_ESTABLISHED_SYNTHETIC' });
    checkpoint();
    const alreadyOwned = await getDb().pool.query(
      'SELECT id FROM tenants WHERE name = ANY($1::text[])',
      [[tenantName, otherTenantName]],
    );
    if (alreadyOwned.rowCount) throw new Error('run ID already has tenants; refusing to reuse or delete them');
    for (const file of [path.join(isolation.evidenceDirectory, runId), path.join(isolation.evidenceDirectory, `${runId}.partial`)]) {
      try { await fs.stat(file); throw new Error('run ID already has archived evidence; refusing reuse'); }
      catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    }
    interruption.signal.throwIfAborted();
    inputUploadAttempted = true;
    record.recovery = { ...record.recovery, intendedInputKey: inputKey }; checkpoint();
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: inputKey,
      Body: input,
      ContentType: 'video/mp4',
      IfNoneMatch: '*',
    }));
    inputUploadConfirmed = true;
    artifactKeys.add(inputKey);
    record.recovery = { ...record.recovery, objectKeys: [...artifactKeys] }; checkpoint();
    signedSourceUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: bucket, Key: inputKey }),
      { expiresIn: 900 },
    );

    preserveRemoteEvidence = true; // Unknown transaction outcome must retain recovery state.
    tenantId = await createRunTenant(tenantName, apiKeyHash);
    record.recovery = { ...record.recovery, tenantId }; checkpoint();
    otherTenantId = await createRunTenant(otherTenantName, otherApiKeyHash);
    preserveRemoteEvidence = false;
    record.recovery = { ...record.recovery, otherTenantId }; checkpoint();
    // Emulate the commercial state Onboarding would sync after successful
    // checkout. This is limited to the unique disposable development tenant.
    const provisioned = await getDb().pool.query(
      `UPDATE tenants
       SET status = 'active', active = true, expires_at = now() + interval '1 day'
       WHERE id = $1 AND name = $2
       RETURNING id`,
      [tenantId, tenantName],
    );
    if (provisioned.rowCount !== 1) {
      throw new Error('disposable tenant provisioning did not settle exactly once');
    }
    const otherProvisioned = await getDb().pool.query(
      `UPDATE tenants SET status = 'active', active = true, expires_at = now() + interval '1 day'
       WHERE id = $1 AND name = $2 RETURNING id`,
      [otherTenantId, otherTenantName],
    );
    if (otherProvisioned.rowCount !== 1 || otherTenantId === tenantId) {
      throw new Error('second disposable tenant provisioning failed');
    }
    otherArtifactKey = `artifacts/${otherTenantId}/${runId}-isolation.txt`;
    await r2.send(new PutObjectCommand({
      Bucket: bucket, Key: otherArtifactKey, Body: `eic-isolation-${runId}`,
      ContentType: 'text/plain', IfNoneMatch: '*',
    }));
    artifactKeys.add(otherArtifactKey);

    const health = await fetch(`${baseUrl}/readiness`, { signal: interruption.signal });
    const healthBody = await checkedJson(health, 'readiness');
    if (!healthBody?.ok || healthBody?.checks?.postgres !== 'up' || healthBody?.checks?.redis !== 'up') {
      throw new Error(`readiness did not report PostgreSQL and Redis up: ${JSON.stringify(healthBody)}`);
    }

    submissionAttempted = true;
    record.recovery = { ...record.recovery, submissionAttempted: true }; checkpoint();
    const submittedAt = Date.now();
    const create = await fetch(`${baseUrl}/v1/jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        source_url: signedSourceUrl,
        preset_id: preset,
        language: 'en',
      }),
      signal: interruption.signal,
    });
    const created = await checkedJson(create, 'authenticated job submission');
    const jobId = created?.data?.id as string | undefined;
    if (!jobId) throw new Error('job submission returned no id');
    knownJobId = jobId;
    jobSteps = created?.data?.steps || {};
    if (!['captions', 'ad', 'color', 'videoTransform'].every(name => typeof jobSteps[name] === 'string' && jobSteps[name].length > 0)) {
      jobSteps = {}; throw new Error('incomplete submission IDs; retained potentially active flow for recovery');
    }
    record.recovery = { ...record.recovery, jobSteps }; checkpoint();
    if (tenantId) {
      if (jobSteps.captions) addOwnedArtifact(artifactKeys, `artifacts/${tenantId}/${jobSteps.captions}.vtt`, tenantId);
      if (jobSteps.ad) addOwnedArtifact(artifactKeys, `artifacts/${tenantId}/${jobSteps.ad}.mp3`, tenantId);
      if (jobSteps.color) addOwnedArtifact(artifactKeys, `artifacts/${tenantId}/${jobSteps.color}.json`, tenantId);
      if (jobSteps.videoTransform) {
        addOwnedArtifact(artifactKeys, `artifacts/${tenantId}/${jobSteps.videoTransform}-transformed.mp4`, tenantId);
        addOwnedArtifact(artifactKeys, `artifacts/${tenantId}/${jobSteps.videoTransform}-evidence.json`, tenantId);
      }
    }

    log('Authenticated submission accepted');
    log(`Job: ${jobId}`);

    const deadline = submittedAt + EIC_PROTOCOL.timeoutMs;
    let completed: JobStatus | undefined;
    while (Date.now() < deadline) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 2_000);
        interruption.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(interruption.signal.reason);
        }, { once: true });
      });
      const response = await fetch(`${baseUrl}/v1/jobs/${jobId}`, {
        headers: { 'x-api-key': apiKey },
        signal: interruption.signal,
      });
      const status = await checkedJson(response, 'job status') as JobStatus;
      for (const step of Object.values(status.data?.steps || {})) {
        addOwnedArtifact(artifactKeys, step.artifactKey, tenantId!);
        addOwnedArtifact(artifactKeys, step.evidenceArtifactKey, tenantId!);
      }
      const summary = Object.entries(status.data?.steps || {})
        .map(([name, step]) => `${name}=${step.status || 'unknown'}`)
        .join(', ');
      log(`Status: ${status.data?.status || 'unknown'} (${summary})`);

      if (status.data?.status === 'failed') {
        throw new Error('required pipeline job failed; see recorded step statuses');
      }
      if (status.data?.status === 'completed') {
        completed = status;
        break;
      }
    }
    if (!completed) throw new Error('job did not complete within 240 seconds');
    for (const step of Object.values(completed.data?.steps || {})) {
      addOwnedArtifact(artifactKeys, step.artifactKey, tenantId!);
      addOwnedArtifact(artifactKeys, step.evidenceArtifactKey, tenantId!);
    }

    requireRealArtifacts(completed.data?.steps, tenantId!, EIC_PROTOCOL.requiredRealArtifacts);
    record.metrics.pipelineDurationMs = Date.now() - submittedAt;
    if ((record.metrics.pipelineDurationMs as number) > EIC_PROTOCOL.timeoutMs) throw new Error('declared pipeline timeout exceeded');
    record.assertions!.push({ id: 'required-real-artifacts', status: 'PASSED' },
      { id: 'ad-real-output', status: 'NOT_APPLICABLE_DISABLED', detail: completed.data?.steps?.ad?.degraded ? 'degraded marker; not validated' : 'disabled AD; not validated' });
    const captions = completed.data?.steps?.captions;
    const transformed = completed.data?.steps?.videoTransform;
    for (const stepName of ['captions', 'ad', 'color', 'videoTransform']) {
      const step = completed.data?.steps?.[stepName];
      if (!jobSteps[stepName] || step?.status !== 'completed') {
        throw new Error(`required ${stepName} flow step did not complete`);
      }
    }
    if (captions?.status !== 'completed' || !captions.url || !captions.artifactKey) {
      throw new Error('caption artifact was not completed and signed');
    }
    if (transformed?.status !== 'completed' || !transformed.url || !transformed.artifactKey) {
      throw new Error('transformed video artifact was not completed and signed');
    }
    const tenantPrefix = `artifacts/${tenantId}/`;
    if (!captions.artifactKey.startsWith(tenantPrefix) || !transformed.artifactKey.startsWith(tenantPrefix)) {
      throw new Error('artifact keys are outside the authenticated tenant namespace');
    }

    const [captionResponse, videoResponse] = await Promise.all([
      fetch(captions.url, { signal: interruption.signal }),
      fetch(transformed.url, { signal: interruption.signal }),
    ]);
    if (!captionResponse.ok) throw new Error(`signed caption fetch failed: HTTP ${captionResponse.status}`);
    if (!videoResponse.ok) throw new Error(`signed video fetch failed: HTTP ${videoResponse.status}`);

    const captionText = await captionResponse.text();
    const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
    const retrievedVideoPath = path.join(tempDir, 'retrieved-output.mp4');
    await addEvidenceFile(tempDir, 'output-video.mp4', videoBytes, record);
    await fs.writeFile(retrievedVideoPath, videoBytes);
    if (!captionText.startsWith('WEBVTT') || captionText.length < 20) {
      throw new Error('retrieved caption artifact is not a non-empty WebVTT document');
    }
    if (videoBytes.length < 1_000) {
      throw new Error('retrieved transformed video artifact is unexpectedly small');
    }
    await addEvidenceFile(tempDir, 'output-captions.vtt', captionText, record);
    if (!/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(captionText)) {
      throw new Error('caption file contains no timestamped cues');
    }
    record.metrics.outputMedia = inspectMedia(retrievedVideoPath);
    record.metrics.captionCueCount = (captionText.match(/-->/g) || []).length;
    record.metrics.captionInspection = inspectCaptions(captionText, (record.metrics.outputMedia as any).durationSeconds);
    if (preset === 'deaf') {
      record.assertions!.push({ id: 'caption-content-quality', status: 'PENDING_EXPERT_AGREEMENT' },
        { id: 'visible-caption-overlay', status: 'PENDING_INDEPENDENT_INSPECTION' });
      for (const [i, time] of [0.25, 0.5, 0.75].entries()) {
        const framePath = path.join(tempDir, `frame-${i}.jpg`);
        execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time * (record.metrics.outputMedia as any).durationSeconds),
          '-i', retrievedVideoPath, '-frames:v', '1', framePath]);
        await addEvidenceFile(tempDir, `overlay-inspection-${i}.jpg`, await fs.readFile(framePath), record);
      }
    }
    for (const [name, file] of [['color', 'output-color.json']] as const) {
      const url = completed.data?.steps?.[name]?.url;
      if (!url) throw new Error(`required ${name} signed artifact is missing`);
      const response = await fetch(url, { signal: interruption.signal });
      if (!response.ok) throw new Error(`required ${name} artifact download failed: HTTP ${response.status}`);
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.length < 20) throw new Error(`required ${name} artifact is empty or stubbed`);
      if (name === 'color') {
        const colors = JSON.parse(Buffer.from(data).toString('utf8'));
        if (!Array.isArray(colors.dominant_colors) || !colors.dominant_colors.length
          || !colors.dominant_colors.every((color: any) => Array.isArray(color) && /^#[a-f0-9]{6}$/i.test(color[0])
            && Number.isFinite(color[1]) && color[1] > 0)) throw new Error('color analysis is missing real nonempty color measurements');
        record.metrics.colorAnalysis = { dominantColorCount: colors.dominant_colors.length,
          contrastRatioStatus: 'NOT_VALIDATED; current worker value is provisional' };
      }
      await addEvidenceFile(tempDir, file, data, record);
    }
    if (preset !== 'deaf') {
      if (!transformed.evidenceUrl || !transformed.evidenceArtifactKey) {
        throw new Error('epilepsy transform did not return signed engineering evidence');
      }
      if (!transformed.evidenceArtifactKey.startsWith(tenantPrefix)) {
        throw new Error('engineering evidence is outside the authenticated tenant namespace');
      }
      const evidenceResponse = await fetch(transformed.evidenceUrl, { signal: interruption.signal });
      if (!evidenceResponse.ok) {
        throw new Error(`signed evidence fetch failed: HTTP ${evidenceResponse.status}`);
      }
      const evidence = await evidenceResponse.json();
      record.metrics.engineering = {
        kind: evidence.kind,
        before: numericMeasurements(evidence.before),
        after: numericMeasurements(evidence.after),
        encodedTruePeakDbtp: evidence.encodedTruePeakDbtp,
        encodedTruePeakCeilingDbtp: evidence.encodedTruePeakCeilingDbtp,
      };
      await addEvidenceFile(tempDir, 'engineering-metrics.json', JSON.stringify(record.metrics.engineering, null, 2), record);
      validateEngineeringEvidence(preset, evidence);
      if (preset === 'epilepsy_noise') {
        const inspection = inspectPlayableEpilepsyNoiseOutput(retrievedVideoPath);
        if (
          inspection.truePeakDbtp > evidence.encodedTruePeakCeilingDbtp
          || Math.abs(inspection.truePeakDbtp - evidence.encodedTruePeakDbtp) > 0.01
        ) {
          throw new Error(
            `retrieved encoded true peak failed independent verification: ${JSON.stringify(inspection)}`,
          );
        }
        log(`epilepsy_noise downloaded output: ${JSON.stringify(inspection)}`);
        record.metrics.independentOutputAudio = inspection;
      }
      log(`${preset} before/after engineering proxy measurements verified`);
    }

    const ownSignResponse = await fetch(
      `${baseUrl}/v1/files/sign?${new URLSearchParams({ id: captions.artifactKey, ttl: '60' })}`,
      { headers: { 'x-api-key': apiKey } },
    );
    if (!ownSignResponse.ok) {
      throw new Error(`own-tenant signing endpoint failed: HTTP ${ownSignResponse.status}`);
    }
    const crossTenantResponse = await fetch(
      `${baseUrl}/v1/files/sign?${new URLSearchParams({
        id: captions.artifactKey,
        ttl: '60',
      })}`,
      { headers: { 'x-api-key': otherApiKey }, signal: interruption.signal },
    );
    if (crossTenantResponse.status !== 404) {
      throw new Error(`second tenant could sign first tenant artifact: HTTP ${crossTenantResponse.status}`);
    }
    const reverseSign = await fetch(
      `${baseUrl}/v1/files/sign?${new URLSearchParams({ id: otherArtifactKey!, ttl: '60' })}`,
      { headers: { 'x-api-key': apiKey }, signal: interruption.signal },
    );
    if (reverseSign.status !== 404) throw new Error('first tenant could sign second tenant artifact');
    const ownOther = await fetch(
      `${baseUrl}/v1/files/sign?${new URLSearchParams({ id: otherArtifactKey!, ttl: '60' })}`,
      { headers: { 'x-api-key': otherApiKey }, signal: interruption.signal },
    );
    const otherSigned = await checkedJson(ownOther, 'second tenant own-artifact signing');
    if (!otherSigned?.data?.url) throw new Error('second tenant own-artifact signed URL missing');
    const probe = await fetch(otherSigned.data.url, { signal: interruption.signal });
    if (!probe.ok || await probe.text() !== `eic-isolation-${runId}`) {
      throw new Error('second tenant own-artifact retrieval failed');
    }
    const otherJob = await fetch(`${baseUrl}/v1/jobs/${jobId}`, {
      headers: { 'x-api-key': otherApiKey }, signal: interruption.signal,
    });
    if (otherJob.status !== 404) throw new Error('second tenant could read first tenant job');
    log('Two provisioned tenants: own artifacts readable, both cross-tenant artifact directions and job lookup denied');
    record.assertions!.push({ id: 'tenant-artifact-isolation', status: 'PASSED' });
    log('Signed caption artifact retrieved and verified as WebVTT');
    log(`Signed transformed video retrieved (${videoBytes.length} bytes)`);
    log('Alternate signing endpoint allowed own-tenant and denied cross-tenant keys');
    smokePassed = true;
  } catch (error) {
    technicalFailure = redact(error instanceof Error ? error.message : error);
    if (inputUploadAttempted && !inputUploadConfirmed) preserveRemoteEvidence = true;
    log(`Technical failure: ${technicalFailure}`);
  } finally {
    // Retain available outputs even when the engineering checks fail or a signal
    // interrupts the attempt. These are read-only preservation requests, bounded
    // independently from the cancelled validation requests.
    if (knownJobId && tenantId) {
      try {
        const response = await fetch(`${baseUrl}/v1/jobs/${knownJobId}`, {
          headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(10_000),
        });
        const finalStatus = await checkedJson(response, 'evidence status capture') as JobStatus;
        record.metrics.finalStepStatuses = Object.fromEntries(Object.entries(finalStatus.data?.steps || {})
          .map(([name, step]) => [name, { status: step.status || 'missing', degraded: step.degraded ?? 'unknown',
            artifactKey: step.artifactKey || null, evidenceArtifactKey: step.evidenceArtifactKey || null }]));
        for (const [name, step] of Object.entries(finalStatus.data?.steps || {})) {
          if (!/^[a-zA-Z]+$/.test(name)) throw new Error('unexpected step identity');
          for (const [kind, url, key] of [['output', step.url, step.artifactKey],
            ['metrics', step.evidenceUrl, step.evidenceArtifactKey]] as const) {
            if (!key) continue;
            addOwnedArtifact(artifactKeys, key, tenantId);
            if (!url) throw new Error('existing artifact has no retrievable evidence URL');
            const download = await fetch(url, { signal: AbortSignal.timeout(20_000) });
            if (!download.ok || !download.body) throw new Error('available output evidence download failed');
            const chunks: Uint8Array[] = []; let size = 0;
            for await (const chunk of download.body as any) {
              size += chunk.length;
              if (size > 128 * 1024 * 1024) throw new Error('evidence artifact exceeds 128 MiB retention bound');
              chunks.push(chunk);
            }
            const suffix = kind === 'metrics' ? 'json' : name === 'captions' ? 'vtt' : name === 'ad' ? 'mp3' : name === 'color' ? 'json' : 'mp4';
            await addEvidenceFile(tempDir, `captured-${name.toLowerCase()}-${kind}.${suffix}`, Buffer.concat(chunks), record);
          }
        }
      } catch (error) {
        preserveRemoteEvidence = true;
        record.assertions!.push({ id: 'failed-attempt-output-preservation', status: 'BLOCKED',
          detail: redact(error instanceof Error ? error.message : error) });
        technicalFailure ||= 'available output preservation incomplete; remote evidence retained';
      }
    }
    record.recovery = { ...record.recovery, objectKeys: [...artifactKeys], preserveRemoteEvidence };
    record.finishedAt = new Date().toISOString();
    record.outcome = interruption.signal.aborted ? 'interrupted' : smokePassed ? 'passed' : 'failed';
    if (technicalFailure) record.technicalFailure = technicalFailure;
    // The journal is retained in tempDir even when the archive cannot be written.
    await fs.writeFile(path.join(tempDir, 'recovery-manifest.json'), JSON.stringify(record, null, 2), { mode: 0o600 });
    try {
      archivedAt = await archiveEvidence(tempDir, isolation.evidenceDirectory, record);
      log('Archive copied and read-back SHA-256 verified before cleanup');
    } catch (error) {
      const reason = redact(error instanceof Error ? error.message : error);
      console.error(`Evidence archive failed; keeping temporary and remote data for recovery at ${tempDir}: ${reason}`);
      technicalFailure ||= `evidence preservation blocked: ${reason}`;
      record.technicalFailure = technicalFailure;
      record.outcome = 'blocked';
      await fs.writeFile(path.join(tempDir, 'recovery-manifest.json'), JSON.stringify(record, null, 2), { mode: 0o600 });
    }
    const cleanupFailures: string[] = [];
    const cleanup = async (label: string, operation: () => Promise<unknown>): Promise<boolean> => {
      try {
        await operation();
        return true;
      } catch (error) {
        cleanupFailures.push(`${label}: ${redact(error instanceof Error ? error.message : error)}`);
        return false;
      }
    };

    let queueStateRemoved = true;
    if (preserveRemoteEvidence) {
      queueStateRemoved = false;
      cleanupFailures.push('output preservation incomplete or upload uncertain; remote state retained');
    }
    if (submissionAttempted && Object.keys(jobSteps).length === 0) {
      queueStateRemoved = false;
      cleanupFailures.push('submission response was uncertain; retained source, tenants and possible queue work');
    }
    if (archivedAt && !preserveRemoteEvidence && Object.keys(jobSteps).length > 0) {
      const redis = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
        maxRetriesPerRequest: null,
      });
      const prefix = process.env.QUEUE_PREFIX || 'sinna:mvp';
      const queues = {
        videoTransform: new Queue('video-transform', { connection: redis, prefix }),
        captions: new Queue('captions', { connection: redis, prefix }),
        ad: new Queue('ad', { connection: redis, prefix }),
        color: new Queue('color', { connection: redis, prefix }),
      };
      for (const name of ['videoTransform', 'captions', 'ad', 'color'] as const) {
        const id = jobSteps[name];
        if (id) {
          queueStateRemoved =
            (await cleanup(`remove ${name} job`, () => removeOwnedQueueJobStrict(queues[name], id, tenantId!)))
            && queueStateRemoved;
        }
      }
      if (tenantId && signedSourceUrl) {
        const idemHash = crypto.createHash('sha256')
          .update(`${signedSourceUrl}|${preset}|en|${tenantId}`)
          .digest('hex');
        queueStateRemoved =
          (await cleanup('remove idempotency entry', () => redis.del(`${prefix}:jobs:idempotency:${idemHash}`)))
          && queueStateRemoved;
      }
      for (const queue of Object.values(queues)) {
        queueStateRemoved = (await cleanup('close cleanup queue', () => queue.close())) && queueStateRemoved;
      }
      queueStateRemoved = (await cleanup('close cleanup Redis connection', async () => redis.quit())) && queueStateRemoved;
    }

    let r2StateRemoved = true;
    if (mayDeleteRunMedia(!!archivedAt, submissionAttempted, Object.keys(jobSteps).length > 0, queueStateRemoved)) {
      for (const key of artifactKeys) {
        r2StateRemoved =
          (await cleanup(`delete R2 object ${key}`, () =>
            r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))))
          && r2StateRemoved;
      }
    } else if (archivedAt) {
      cleanupFailures.push('queue state remains or submission uncertain; retained R2 source and tenants for manual recovery');
    }
    if (archivedAt && queueStateRemoved && r2StateRemoved) {
      for (const [id, name] of [[tenantId, tenantName], [otherTenantId, otherTenantName]] as const) {
        if (!id) continue;
        await cleanup(`delete current-run tenant ${name}`, async () => {
          const deleted = await getDb().pool.query(
            'DELETE FROM tenants WHERE id = $1 AND name = $2',
            [id, name],
          );
          if (deleted.rowCount !== 1) throw new Error(`expected one row, deleted ${deleted.rowCount}`);
        });
      }
    }
    await cleanup('close smoke database pool', () => getDb().pool.end());
    record.cleanupFailures = cleanupFailures;
    record.recovery = { ...record.recovery, temporaryMediaRetained: true };
    checkpoint();
    if (interruption.signal.aborted) record.outcome = 'interrupted';
    else if (cleanupFailures.length > 0) record.outcome = 'failed';
    if (archivedAt) {
      try {
        await updateArchivedOutcome(archivedAt, record);
      } catch (error) {
        technicalFailure ||= `final evidence update blocked: ${redact(error instanceof Error ? error.message : error)}`;
        record.technicalFailure = technicalFailure;
        record.outcome = 'blocked';
        await fs.writeFile(path.join(tempDir, 'recovery-manifest.json'), JSON.stringify(record, null, 2), { mode: 0o600 });
      }
    }
    // Keep the local recovery copy even on success. It also protects a final
    // manifest write failure; verified archives are the durable reviewer copy.
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    checkpoint();
  }
  if (technicalFailure || record.cleanupFailures.length || !archivedAt || interruption.signal.aborted) {
    throw new Error(JSON.stringify({
      technicalFailure: technicalFailure || null,
      cleanupFailures: record.cleanupFailures,
      archive: archivedAt ? 'verified' : 'failed; temporary and remote data retained',
      interrupted: interruption.signal.aborted,
    }));
  }
  if (smokePassed) {
    console.log(`Investor MVP ${preset} golden path passed with disposable state cleaned.`);
  }
}

main().catch((error) => {
  const failure = redact(error instanceof Error ? error.message : error);
  if (!activeRecord) {
    const suppliedId = process.env.MVP_RUN_ID;
    activeRecord = {
      runId: suppliedId && /^[0-9a-f-]{36}$/i.test(suppliedId) ? suppliedId : crypto.randomUUID(),
      preset: process.argv[2] || 'deaf', revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      changesSha256: sha256(execFileSync('git', ['diff', 'HEAD'], { encoding: 'utf8' })
        + execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' })),
      startedAt: attemptStartedAt, finishedAt: new Date().toISOString(),
      toolVersions: { node: process.version }, configuration: { resourceAccess: 'preflight blocked; no media or cleanup' },
      logs: [{ at: new Date().toISOString(), event: failure }], files: {}, metrics: {}, outcome: 'blocked',
      cleanupFailures: [], technicalFailure: failure, protocol: { version: EIC_PROTOCOL.version, sha256: protocolSha256 },
      assertions: [{ id: 'preflight', status: 'BLOCKED', detail: failure }],
    };
  } else {
    activeRecord.finishedAt ||= new Date().toISOString();
    activeRecord.technicalFailure ||= failure;
    if (activeRecord.outcome === 'running') activeRecord.outcome = 'failed';
  }
  try { console.error(`Evidence journal retained: ${checkpoint()}`); }
  catch { console.error('Evidence journal unavailable; no cleanup authorized; retain all recovery state'); }
  console.error(failure);
  process.exit(1);
});