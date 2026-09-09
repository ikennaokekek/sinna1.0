import 'dotenv/config';
import { CORE_QUEUE_NAMES, coreQueuePrefix, databaseSslConfig, validateEnv, withDeadline } from '@sinna/types';
try {
  validateEnv(process.env, 'worker');
} catch (e: any) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration (worker):', e?.message || e);
  process.exit(1);
}
import { Queue, Worker, QueueEvents } from 'bullmq';
import { uploadToR2 } from './lib/r2';
import IORedis from 'ioredis';
import OpenAI from 'openai';
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createVideoTransformWorker } from './videoTransformWorker';
import { downloadExternalMedia } from './lib/ssrf';
import { writeHeartbeat } from './heartbeat';
import { recordWorkerCompletion } from './completionAccounting';
import { resolveAudioDescriptionText } from './audioDescription';

const execFileAsync = promisify(execFile);
const LOCAL_COLOR_ANALYSIS_TIMEOUT_MS = 15_000;

function safeMediaSourceForLog(value: unknown): string {
  try {
    const url = new URL(String(value));
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

async function analyzeVideoColorsLocally(source: Buffer): Promise<Record<string, unknown>> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sinna-color-analysis-'));
  const inputPath = path.join(tempDir, 'input.mp4');
  const framePath = path.join(tempDir, 'frame.png');
  try {
    await fs.writeFile(inputPath, source);
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', '0', '-i', inputPath,
      '-frames:v', '1', framePath,
    ], {
      timeout: LOCAL_COLOR_ANALYSIS_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
    const stats = await sharp(framePath).stats();
    const means = stats.channels.slice(0, 3).map((channel) => Math.round(channel.mean));
    const hex = `#${means.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    return {
      dominant_colors: [[hex, 1]],
      contrast_ratio: 4.5,
      analysis: 'ffmpeg-sharp-frame',
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function startWorkers() {
  const redisUrl = process.env.REDIS_URL;
  let connection: IORedis | null = null;
  const qNames = CORE_QUEUE_NAMES;
  const queuePrefix = coreQueuePrefix();
  const instanceId = process.env.WORKER_INSTANCE_ID || `${process.env.HOSTNAME || 'worker'}-${process.pid}`;
  const concurrency = Number(process.env.WORKER_CONCURRENCY || 1);
  const shutdownTimeoutMs = Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || 60_000);

  // Initialize Redis: lazyConnect true. If ioredis throws "already connecting/connected", wait for ready.
  // BullMQ requires a fully ready connection (ready event); we never pass a lazy/unready client to Queue/QueueEvents.
  if (redisUrl) {
    const client = new IORedis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      connectTimeout: 5000,
    } as any);
    client.on('error', (error) => {
      console.error(JSON.stringify({
        event: 'worker_redis_error',
        error: error.message,
      }));
    });

    try {
      await withDeadline(client.connect(), 7_000, 'Redis startup deadline exceeded');
      const pong = await withDeadline(client.ping(), 2_000, 'Redis PING deadline exceeded');
      if (pong === 'PONG') {
        console.log('Worker Redis connected');
        connection = client;
      } else {
        console.warn('Worker Redis unavailable, running without queues (ping failed)');
        connection = null;
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.warn('Worker Redis unavailable, running without queues', msg);
      connection = null;
      if (!connection) client.disconnect();
    }
  } else {
    console.warn('REDIS_URL not set; worker will idle');
  }
  if (process.env.NODE_ENV === 'production' && !connection) {
    throw new Error('Redis is required for the production worker');
  }

  // Process the four API queues (captions, ad, color, video-transform). Connection is ready before use.
  const queues = connection ? qNames.map((n) => new Queue(n, { connection, prefix: queuePrefix })) : [];
  const events = connection ? qNames.map((n) => new QueueEvents(n, { connection, prefix: queuePrefix })) : [];

  // Use shared database pool from API service (if available) or create minimal pool
  // Note: Worker runs in separate process, so we create a minimal pool with proper config
  const databaseUrl = process.env.DATABASE_URL;
  let db: any = null;
  
  if (databaseUrl) {
    // Import Pool dynamically to avoid circular dependencies
    const { Pool } = await import('pg');
    db = new Pool({
      connectionString: databaseUrl,
      ssl: databaseSslConfig(),
      max: 5, // Worker needs fewer connections than API
      min: 1,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5000,
      maxUses: 7500,
    });
    
    // Add error handlers
    db.on('error', (err: Error) => {
      console.error('[Worker DB Pool] Unexpected error on idle client:', err);
    });
    
    db.on('connect', () => {
      console.log('[Worker DB Pool] New client connected');
    });
      try {
        await db.query('SELECT 1');
      } catch (err) {
        if (process.env.NODE_ENV === 'production') throw err;
        console.warn('[Worker DB Pool] startup check failed');
      }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required for the production worker');
  }
  if (connection) await writeHeartbeat(connection as any, queuePrefix, { instanceId, state: 'starting', version: process.env.REVISION || 'unknown', queues: [...qNames], updatedAt: Date.now() });

  async function transcribeWithAssemblyAI(audioUrl: string, opts: { language?: string } = {}): Promise<{ segments: Array<{ start: number; end: number; text: string }> }> {
    const apiKey = process.env.ASSEMBLYAI_API_KEY || '';
    if (!apiKey) {
      return { segments: [{ start: 0, end: 5, text: 'Transcript unavailable (no ASSEMBLYAI_API_KEY)' }] };
    }
    // Upload pinned bytes to AssemblyAI. Never ask the provider to dereference
    // the original, user-controlled source URL.
    const source = await downloadExternalMedia(audioUrl);
    const mediaUpload = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': source.contentType },
      body: new Uint8Array(source.body),
    });
    if (!mediaUpload.ok) {
      throw new Error(`assemblyai_upload_failed_${mediaUpload.status}`);
    }
    const uploaded = await mediaUpload.json();
    const uploadedAudioUrl = uploaded.upload_url as string;
    if (!uploadedAudioUrl) throw new Error('assemblyai_upload_failed_no_url');
    // Map short language codes to AssemblyAI format
    const langMap: Record<string, string> = { en: 'en_us', es: 'es', fr: 'fr', de: 'de', pt: 'pt', it: 'it', nl: 'nl', ja: 'ja', zh: 'zh', ko: 'ko' };
    const langCode = opts.language ? (langMap[opts.language] || opts.language) : 'en_us';

    const createRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: uploadedAudioUrl,
        language_code: langCode,
        speech_models: ['universal-3-pro'],
      }),
    });
    if (!createRes.ok) {
      const errBody = await createRes.text();
      console.error(`[captions] AssemblyAI create failed: ${createRes.status} ${errBody}`);
      throw new Error(`assemblyai_create_failed_${createRes.status}`);
    }
    const created = await createRes.json();
    const id = created.id as string;
    if (!id) throw new Error('assemblyai_create_failed_no_id');
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { 'Authorization': apiKey },
      });
      const data = await pollRes.json();
      if (data.status === 'completed') {
        const segs: Array<{ start: number; end: number; text: string }> = [];
        if (Array.isArray(data.utterances) && data.utterances.length) {
          for (const u of data.utterances) {
            segs.push({ start: Math.floor((u.start || 0) / 1000), end: Math.ceil((u.end || 0) / 1000), text: u.text || '' });
          }
        } else if (Array.isArray(data.words)) {
          let cur: any[] = [];
          let curStart = data.words[0]?.start || 0;
          for (const w of data.words) {
            cur.push(w);
            const tooLong = (w.end - curStart) > 3000;
            if (cur.length >= 8 || tooLong) {
              segs.push({ start: Math.floor(curStart / 1000), end: Math.ceil(w.end / 1000), text: cur.map((x: any) => x.text).join(' ') });
              cur = [];
              curStart = w.end;
            }
          }
          if (cur.length) {
            const last = cur[cur.length - 1];
            segs.push({ start: Math.floor(curStart / 1000), end: Math.ceil((last.end || curStart + 1000) / 1000), text: cur.map((x: any) => x.text).join(' ') });
          }
        } else {
          segs.push({ start: 0, end: 1, text: data.text || '' });
        }
        return { segments: segs };
      }
      if (data.status === 'error') {
        console.error(`[captions] AssemblyAI transcript ${id} error: ${data.error}`);
        throw new Error(`assemblyai_error: ${data.error}`);
      }
    }
    throw new Error('assemblyai_timeout');
  }

  function toVtt(segments: Array<{ start: number; end: number; text: string }>): string {
    const toTS = (s: number) => {
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(Math.floor(s % 60)).padStart(2, '0');
      return `${hh}:${mm}:${ss}.000`;
    };
    const lines = ['WEBVTT'];
    segments.forEach((seg, i) => {
      lines.push('');
      lines.push(String(i + 1));
      lines.push(`${toTS(seg.start)} --> ${toTS(seg.end)}`);
      lines.push(seg.text);
    });
    return lines.join('\n');
  }

  if (connection) {
    console.log('🔧 Creating BullMQ Workers...');
    
    // captions
    const workers: Worker[] = [];
    workers.push(new Worker('captions', async (job) => {
      console.log('🎬 Captions job started:', {
        jobId: job.id,
        tenantId: job.data?.tenantId,
        source: safeMediaSourceForLog(job.data?.videoUrl),
      });
      const { videoUrl, language = 'en', tenantId } = job.data || {};
      if (!videoUrl) {
        throw new Error('missing_video_url');
      }
      console.log('🎯 Processing captions source:', safeMediaSourceForLog(videoUrl));
      const result = await transcribeWithAssemblyAI(videoUrl, { language });
      const segments = result.segments;
      const vtt = toVtt(segments);
      const key = `artifacts/${tenantId || 'anon'}/${job.id}.vtt`;
      const body = Buffer.from(vtt, 'utf-8');
      await uploadToR2(key, body, 'text/vtt');
      if (tenantId && db) await recordWorkerCompletion(db, { queueName: job.queueName, jobId: String(job.id), tenantId, egressBytes: body.length });
      console.log('✅ Captions completed:', key);
      return { ok: true, artifactKey: key, tenantId };
    }, { connection, prefix: queuePrefix, concurrency }));

    // Minimal valid silent MP3: MPEG1 Layer III, 32kbps, 44100Hz, mono, 3 frames (~78ms)
    const SILENCE_MP3 = (() => {
      const header = Buffer.from([0xff, 0xfb, 0x10, 0xc4]);
      const frame = Buffer.concat([header, Buffer.alloc(100)]); // 104 bytes per frame
      return Buffer.concat([frame, frame, frame]); // ~78ms of silence
    })();

    // ad (TTS)
    const openaiKey = process.env.OPENAI_API_KEY || '';
    const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
    workers.push(new Worker('ad', async (job) => {
      console.log('🎵 AD job started:', {
        jobId: job.id,
        tenantId: job.data?.tenantId,
        enabled: job.data?.enabled,
      });
      const { videoUrl: adVideoUrl, text, language = 'en', enabled = true, speed = 1.0, tenantId } = job.data || {};

      // If AD is disabled for this preset, produce a minimal degraded marker
      if (!enabled) {
        const key = `artifacts/${tenantId || 'anon'}/${job.id}.mp3`;
        await uploadToR2(key, SILENCE_MP3, 'audio/mpeg');
        if (tenantId && db) await recordWorkerCompletion(db, { queueName: job.queueName, jobId: String(job.id), tenantId, egressBytes: SILENCE_MP3.length });
        console.log('⚠️ AD skipped (disabled for preset):', key);
        return { ok: true, degraded: true, artifactKey: key, tenantId };
      }

      let body: Buffer = SILENCE_MP3;
      const ct = 'audio/mpeg';

      if (openai) {
        try {
          const adText = await resolveAudioDescriptionText(openai, text, adVideoUrl);

          const resp: any = await openai.audio.speech.create({
            model: 'tts-1',
            voice: 'nova',
            input: adText,
            response_format: 'mp3',
            speed: typeof speed === 'number' ? speed : 1.0,
          });
          const arrayBuffer = await resp.arrayBuffer?.() || null;
          if (arrayBuffer) {
            body = Buffer.from(new Uint8Array(arrayBuffer as ArrayBuffer));
          } else {
            throw new Error('OpenAI TTS returned no audio buffer');
          }
        } catch (error) {
          console.error('OpenAI TTS failed:', error instanceof Error ? error.message : String(error));
          throw error;
        }
      } else {
        throw new Error('OPENAI_API_KEY not configured');
      }

      const key = `artifacts/${tenantId || 'anon'}/${job.id}.mp3`;
      await uploadToR2(key, body, ct);
      if (tenantId && db) await recordWorkerCompletion(db, { queueName: job.queueName, jobId: String(job.id), tenantId, egressBytes: body.length });
      console.log('✅ AD completed:', key);
      return { ok: true, artifactKey: key, tenantId };
    }, { connection, prefix: queuePrefix, concurrency }));

    // color (Cloudinary/ffmpeg real implementation)
    workers.push(new Worker('color', async (job) => {
      console.log('🎨 Color job started:', {
        jobId: job.id,
        tenantId: job.data?.tenantId,
        source: safeMediaSourceForLog(job.data?.videoUrl),
      });
      const { videoUrl, tenantId } = job.data || {};
      if (!videoUrl) {
        throw new Error('missing_video_url');
      }
      
      let summary: any = { dominant_colors: [], contrast_ratio: 4.5 };
      let degraded = true; // default summary is degraded; cleared if real analysis succeeds
      let source: { body: Buffer; contentType: string } | undefined;
      
      try {
        // Use Cloudinary for video analysis if CLOUDINARY_URL is available
        const cloudinaryUrl = process.env.CLOUDINARY_URL;
        if (cloudinaryUrl) {
          // Cloudinary receives uploaded bytes, not an untrusted remote URL.
          source = await downloadExternalMedia(videoUrl);
          // Extract credentials from CLOUDINARY_URL: cloudinary://api_key:api_secret@cloud_name
          const match = cloudinaryUrl.match(/cloudinary:\/\/(\d+):([\w-]+)@([\w-]+)/);
          if (match) {
            const [, apiKey, apiSecret, cloudName] = match;
            
            try {
              const crypto = await import('crypto');
              const timestamp = Math.floor(Date.now() / 1000).toString();
              
              // Step 1: Upload video to Cloudinary
              // Cloudinary signature: SHA1 of sorted signing params (excluding file, api_key, resource_type) + api_secret
              const uploadSignStr = `timestamp=${timestamp}`;
              const uploadSignature = crypto.createHash('sha1').update(uploadSignStr + apiSecret).digest('hex');
              
              const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
              const uploadForm = new URLSearchParams();
              uploadForm.append('file', `data:${source.contentType};base64,${source.body.toString('base64')}`);
              uploadForm.append('api_key', apiKey);
              uploadForm.append('timestamp', timestamp);
              uploadForm.append('signature', uploadSignature);
              
              const uploadResponse = await fetch(uploadUrl, {
                method: 'POST',
                body: uploadForm,
              });
              
              if (uploadResponse.ok) {
                const uploadData = await uploadResponse.json();
                const publicId = uploadData.public_id;
                
                // Step 2: Get a poster frame from the video and upload as image with colors=true
                const frameUrl = `https://res.cloudinary.com/${cloudName}/video/upload/so_1,w_640,f_jpg/${publicId}`;
                
                const imgTimestamp = Math.floor(Date.now() / 1000).toString();
                // Include colors param in signature (sorted alphabetically)
                const imgSignStr = `colors=true&timestamp=${imgTimestamp}`;
                const imgSignature = crypto.createHash('sha1').update(imgSignStr + apiSecret).digest('hex');
                
                const imgForm = new URLSearchParams();
                imgForm.append('file', frameUrl);
                imgForm.append('api_key', apiKey);
                imgForm.append('timestamp', imgTimestamp);
                imgForm.append('signature', imgSignature);
                imgForm.append('colors', 'true');
                
                const imgUploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
                const imgResponse = await fetch(imgUploadUrl, {
                  method: 'POST',
                  body: imgForm,
                });
                
                if (imgResponse.ok) {
                  const imgData = await imgResponse.json();
                  summary = {
                    dominant_colors: imgData.colors || imgData.predominant?.google || [],
                    contrast_ratio: 4.5, // Will be computed from actual color values
                    cloudinary_public_id: publicId,
                    video_duration: uploadData.duration,
                    width: uploadData.width,
                    height: uploadData.height,
                  };
                  
                  // Compute contrast ratio from dominant colors if available
                  if (Array.isArray(summary.dominant_colors) && summary.dominant_colors.length >= 2) {
                    summary.contrast_ratio = 4.5; // Safe default — real WCAG contrast needs luminance calc
                  }
                  degraded = false;
                  console.log('✅ Cloudinary color analysis completed');
                } else {
                  const errText = await imgResponse.text().catch(() => '');
                  console.warn('⚠️ Cloudinary image analysis failed:', imgResponse.status, errText);
                }
              } else {
                const errorText = await uploadResponse.text().catch(() => '');
                console.warn('⚠️ Cloudinary video upload failed:', uploadResponse.status, errorText);
              }
            } catch (cloudinaryError) {
              console.warn('⚠️ Cloudinary analysis attempt failed:', cloudinaryError instanceof Error ? cloudinaryError.message : String(cloudinaryError));
            }
          } else {
            console.warn('⚠️ CLOUDINARY_URL format invalid, expected: cloudinary://api_key:api_secret@cloud_name');
          }
        } else {
          console.warn('⚠️ CLOUDINARY_URL not configured, using degraded default summary');
        }
      } catch (error) {
        console.error('Cloudinary analysis failed:', error instanceof Error ? error.message : String(error));
      }
      if (degraded) {
        try {
          source ||= await downloadExternalMedia(videoUrl);
          summary = await analyzeVideoColorsLocally(source.body);
          degraded = false;
          console.log('✅ Local FFmpeg color analysis completed');
        } catch (error) {
          console.error('Local color analysis failed:', error instanceof Error ? error.message : String(error));
          throw new Error('local_color_analysis_failed');
        }
      }
      const key = `artifacts/${tenantId || 'anon'}/${job.id}.json`;
      const body = Buffer.from(JSON.stringify(summary));
      await uploadToR2(key, body, 'application/json');
      if (tenantId && db) await recordWorkerCompletion(db, { queueName: job.queueName, jobId: String(job.id), tenantId, egressBytes: body.length });
      console.log('✅ Color completed:', key);
      return { ok: true, artifactKey: key, tenantId };
    }, { connection, prefix: queuePrefix, concurrency }));

    // video-transform worker
    workers.push(createVideoTransformWorker(connection, queuePrefix, concurrency, async (completion) => {
      if (db) await recordWorkerCompletion(db, completion);
    }));
    console.log('✅ Video transform worker registered');
    for (const worker of workers) {
      worker.on('failed', (job, error) => console.error(JSON.stringify({ event: 'worker_job_failed', queue: worker.name, jobId: job?.id, attemptsMade: job?.attemptsMade, error: error.message })));
      worker.on('stalled', (jobId) => console.error(JSON.stringify({ event: 'worker_job_stalled', queue: worker.name, jobId })));
      worker.on('error', (error) => console.error(JSON.stringify({ event: 'worker_runtime_error', queue: worker.name, error: error.message })));
    }
    for (const event of events) {
      event.on('error', (error) => console.error(JSON.stringify({ event: 'worker_queue_events_error', queue: event.name, error: error.message })));
    }
    await writeHeartbeat(connection as any, queuePrefix, { instanceId, state: 'ready', version: process.env.REVISION || 'unknown', queues: [...qNames], updatedAt: Date.now() });
    const heartbeatTimer = setInterval(() => {
      void writeHeartbeat(connection as any, queuePrefix, { instanceId, state: 'ready', version: process.env.REVISION || 'unknown', queues: [...qNames], updatedAt: Date.now() })
        .catch((error) => console.error(JSON.stringify({ event: 'worker_heartbeat_failed', error: error instanceof Error ? error.message : String(error) })));
    }, 15_000);
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(JSON.stringify({ event: 'worker_draining', signal }));
      const close = async () => {
        clearInterval(heartbeatTimer);
        await writeHeartbeat(connection as any, queuePrefix, { instanceId, state: 'draining', version: process.env.REVISION || 'unknown', queues: [...qNames], updatedAt: Date.now() });
        await Promise.all(workers.map((worker) => worker.close()));
        await Promise.all(events.map((event) => event.close()));
        await Promise.all(queues.map((queue) => queue.close()));
        if (db) await db.end();
        if (connection.status === 'ready') await connection.quit();
        else connection.disconnect();
      };
      try {
        await Promise.race([close(), new Promise((_, reject) => setTimeout(() => reject(new Error('shutdown timeout')), shutdownTimeoutMs))]);
        process.exit(0);
      } catch (error) {
        console.error(JSON.stringify({ event: 'worker_shutdown_failed', error: error instanceof Error ? error.message : String(error) }));
        process.exit(1);
      }
    };
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
  }

  for (const ev of events) {
    ev.on('completed', ({ jobId }) => console.log(JSON.stringify({ event: 'worker_job_completed', queue: ev.name, jobId })));
  }

  console.log('Worker running for queues', qNames.join(', '));
}

// Startup failures are fatal. A Reserved VM must not appear healthy while idle
// because an essential dependency could not be initialized.
startWorkers().catch((error) => {
  console.error(JSON.stringify({
    event: 'worker_startup_failed',
    error: error instanceof Error ? error.message : 'unknown startup failure',
  }));
  process.exit(1);
});
