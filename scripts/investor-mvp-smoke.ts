#!/usr/bin/env tsx

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { getDb, seedTenantAndApiKey } from '../apps/api/src/lib/db';
import {
  removeQueueJobStrict,
  removeTenantQueueState,
} from './lib/investorMvpCleanup';

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

async function removeStaleDemoState(r2: S3Client, bucket: string): Promise<void> {
  const stale = await getDb().pool.query<{ id: string }>(
    `SELECT id FROM tenants WHERE name LIKE 'investor-mvp-%@example.invalid'`,
  );
  for (const { id } of stale.rows) {
    await removeTenantQueueState({
      tenantId: id,
      redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      prefix: process.env.QUEUE_PREFIX || 'sinna:mvp',
    });
    await deleteR2Prefix(r2, bucket, `artifacts/${id}/`);
  }
  for (const row of await getDb().pool.query<{ name: string }>(
    `SELECT name FROM tenants WHERE name LIKE 'investor-mvp-%@example.invalid'`,
  ).then((result) => result.rows)) {
    const runId = row.name.slice('investor-mvp-'.length, -'@example.invalid'.length);
    await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: `demo-inputs/${runId}.mp4` }));
  }
  if (stale.rowCount) {
    await getDb().pool.query(
      `DELETE FROM tenants WHERE name LIKE 'investor-mvp-%@example.invalid'`,
    );
    console.log(`Removed ${stale.rowCount} stale disposable demo tenant(s).`);
  }
}

async function deleteR2Prefix(r2: S3Client, bucket: string, prefix: string): Promise<void> {
  let continuationToken: string | undefined;
  do {
    const listed = await r2.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const object of listed.Contents || []) {
      if (object.Key) {
        await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
      }
    }
    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
}

async function checkedJson(response: Response, operation: string): Promise<any> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${operation} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main(): Promise<void> {
  assertEnvironment();
  const preset = selectedPreset();

  const runId = crypto.randomUUID();
  const apiKey = `sk_live_${crypto.randomBytes(16).toString('hex')}`;
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const tenantName = `investor-mvp-${runId}@example.invalid`;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sinna-investor-mvp-'));
  const inputPath = path.join(tempDir, 'input.mp4');
  const inputKey = `demo-inputs/${runId}.mp4`;
  const artifactKeys = new Set<string>([inputKey]);
  let tenantId: string | undefined;
  let signedSourceUrl: string | undefined;
  let jobSteps: Record<string, string> = {};
  let smokePassed = false;

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
    await removeStaleDemoState(r2, bucket);
    generateRepresentativeInput(preset, inputPath);

    const input = await fs.readFile(inputPath);
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: inputKey,
      Body: input,
      ContentType: 'video/mp4',
    }));
    signedSourceUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: bucket, Key: inputKey }),
      { expiresIn: 900 },
    );

    ({ tenantId } = await seedTenantAndApiKey({
      tenantName,
      plan: 'standard',
      apiKeyHash,
    }));
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

    const health = await fetch(`${baseUrl}/readiness`);
    const healthBody = await checkedJson(health, 'readiness');
    if (!healthBody?.ok || healthBody?.checks?.postgres !== 'up' || healthBody?.checks?.redis !== 'up') {
      throw new Error(`readiness did not report PostgreSQL and Redis up: ${JSON.stringify(healthBody)}`);
    }

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
    });
    const created = await checkedJson(create, 'authenticated job submission');
    const jobId = created?.data?.id as string | undefined;
    if (!jobId) throw new Error('job submission returned no id');
    jobSteps = created?.data?.steps || {};
    if (tenantId) {
      if (jobSteps.captions) artifactKeys.add(`artifacts/${tenantId}/${jobSteps.captions}.vtt`);
      if (jobSteps.ad) artifactKeys.add(`artifacts/${tenantId}/${jobSteps.ad}.mp3`);
      if (jobSteps.color) artifactKeys.add(`artifacts/${tenantId}/${jobSteps.color}.json`);
      if (jobSteps.videoTransform) {
        artifactKeys.add(`artifacts/${tenantId}/${jobSteps.videoTransform}-transformed.mp4`);
        artifactKeys.add(`artifacts/${tenantId}/${jobSteps.videoTransform}-evidence.json`);
      }
    }

    console.log('Authenticated submission accepted.');
    console.log(`Job: ${jobId}`);

    const deadline = Date.now() + 240_000;
    let completed: JobStatus | undefined;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const response = await fetch(`${baseUrl}/v1/jobs/${jobId}`, {
        headers: { 'x-api-key': apiKey },
      });
      const status = await checkedJson(response, 'job status') as JobStatus;
      for (const step of Object.values(status.data?.steps || {})) {
        if (step.artifactKey) artifactKeys.add(step.artifactKey);
      }
      const summary = Object.entries(status.data?.steps || {})
        .map(([name, step]) => `${name}=${step.status || 'unknown'}`)
        .join(', ');
      console.log(`Status: ${status.data?.status || 'unknown'} (${summary})`);

      if (status.data?.status === 'failed') {
        throw new Error(`job failed: ${JSON.stringify(status.data.steps)}`);
      }
      if (status.data?.status === 'completed') {
        completed = status;
        break;
      }
    }
    if (!completed) throw new Error('job did not complete within 240 seconds');
    for (const step of Object.values(completed.data?.steps || {})) {
      if (step.artifactKey) artifactKeys.add(step.artifactKey);
    }

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
      fetch(captions.url),
      fetch(transformed.url),
    ]);
    if (!captionResponse.ok) throw new Error(`signed caption fetch failed: HTTP ${captionResponse.status}`);
    if (!videoResponse.ok) throw new Error(`signed video fetch failed: HTTP ${videoResponse.status}`);

    const captionText = await captionResponse.text();
    const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
    const retrievedVideoPath = path.join(tempDir, 'retrieved-output.mp4');
    await fs.writeFile(retrievedVideoPath, videoBytes);
    if (!captionText.startsWith('WEBVTT') || captionText.length < 20) {
      throw new Error('retrieved caption artifact is not a non-empty WebVTT document');
    }
    if (videoBytes.length < 1_000) {
      throw new Error('retrieved transformed video artifact is unexpectedly small');
    }
    if (preset !== 'deaf') {
      if (!transformed.evidenceUrl || !transformed.evidenceArtifactKey) {
        throw new Error('epilepsy transform did not return signed engineering evidence');
      }
      if (!transformed.evidenceArtifactKey.startsWith(tenantPrefix)) {
        throw new Error('engineering evidence is outside the authenticated tenant namespace');
      }
      const evidenceResponse = await fetch(transformed.evidenceUrl);
      if (!evidenceResponse.ok) {
        throw new Error(`signed evidence fetch failed: HTTP ${evidenceResponse.status}`);
      }
      const evidence = await evidenceResponse.json();
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
        console.log(`epilepsy_noise downloaded output: ${JSON.stringify(inspection)}`);
      }
      console.log(`${preset} evidence: ${JSON.stringify(evidence)}`);
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
        id: 'artifacts/another-tenant/private.vtt',
        ttl: '60',
      })}`,
      { headers: { 'x-api-key': apiKey } },
    );
    if (crossTenantResponse.status !== 404) {
      throw new Error(`cross-tenant signing was not denied: HTTP ${crossTenantResponse.status}`);
    }

    console.log('Signed caption artifact retrieved and verified as WebVTT.');
    console.log(`Signed transformed video retrieved (${videoBytes.length} bytes).`);
    console.log('Alternate signing endpoint allowed own-tenant and denied cross-tenant keys.');
    smokePassed = true;
  } finally {
    const cleanupFailures: string[] = [];
    const cleanup = async (label: string, operation: () => Promise<unknown>): Promise<boolean> => {
      try {
        await operation();
        return true;
      } catch (error) {
        cleanupFailures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    };

    let queueStateRemoved = true;
    if (Object.keys(jobSteps).length > 0) {
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
            (await cleanup(`remove ${name} job`, () => removeQueueJobStrict(queues[name], id)))
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
        await cleanup('close cleanup queue', () => queue.close());
      }
      await cleanup('close cleanup Redis connection', async () => redis.quit());
    }

    let r2StateRemoved = true;
    if (queueStateRemoved) {
      for (const key of artifactKeys) {
        r2StateRemoved =
          (await cleanup(`delete R2 object ${key}`, () =>
            r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))))
          && r2StateRemoved;
      }
      if (tenantId) {
        r2StateRemoved =
          (await cleanup('delete tenant R2 prefix', () =>
            deleteR2Prefix(r2, bucket, `artifacts/${tenantId}/`)))
          && r2StateRemoved;
      }
    } else {
      cleanupFailures.push('queue state remains; retained R2 source and tenant for a later recovery sweep');
    }
    if (tenantId && queueStateRemoved && r2StateRemoved) {
      await cleanup('delete disposable tenant', async () => {
        const deleted = await getDb().pool.query(
          'DELETE FROM tenants WHERE id = $1 AND name = $2',
          [tenantId, tenantName],
        );
        if (deleted.rowCount !== 1) throw new Error(`expected one row, deleted ${deleted.rowCount}`);
      });
    } else if (!tenantId) {
      await cleanup('delete disposable API key', () =>
        getDb().pool.query('DELETE FROM api_keys WHERE key_hash = $1', [apiKeyHash]));
    }
    await cleanup('delete temporary files', () => fs.rm(tempDir, { recursive: true, force: true }));
    await cleanup('close smoke database pool', () => getDb().pool.end());
    if (cleanupFailures.length > 0) {
      throw new Error(`smoke cleanup failed: ${cleanupFailures.join('; ')}`);
    }
  }
  if (smokePassed) {
    console.log(`Investor MVP ${preset} golden path passed with disposable state cleaned.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});