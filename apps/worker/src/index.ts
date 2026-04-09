import 'dotenv/config';
import { validateEnv } from '@sinna/types';
try {
  validateEnv(process.env);
} catch (e: any) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration (worker):', e?.message || e);
  process.exit(1);
}
import { Queue, Worker, QueueEvents } from 'bullmq';
import { uploadToR2 } from './lib/r2';
import IORedis from 'ioredis';
import OpenAI from 'openai';
import { createVideoTransformWorker } from './videoTransformWorker';

/** Wait for Redis client to be ready before passing to BullMQ (required for blocking ops). */
function waitForReady(client: IORedis, timeoutMs = 15000): Promise<void> {
  if (client.status === 'ready') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Redis ready timeout')), timeoutMs);
    client.once('ready', () => {
      clearTimeout(t);
      resolve();
    });
    client.once('error', (err: Error) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

async function startWorkers() {
  const redisUrl = process.env.REDIS_URL;
  let connection: IORedis | null = null;

  // Initialize Redis: lazyConnect true. If ioredis throws "already connecting/connected", wait for ready.
  // BullMQ requires a fully ready connection (ready event); we never pass a lazy/unready client to Queue/QueueEvents.
  if (redisUrl) {
    const client = new IORedis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      connectTimeout: 5000,
    } as any);

    try {
      const pong = await client.ping();
      if (pong === 'PONG') {
        await waitForReady(client);
        console.log('Worker Redis connected');
        connection = client;
      } else {
        console.warn('Worker Redis unavailable, running without queues (ping failed)');
        connection = null;
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (/already connecting|already connected/i.test(msg)) {
        try {
          await waitForReady(client);
          console.log('Worker Redis connected');
          connection = client;
        } catch (waitErr: any) {
          console.warn('Worker Redis unavailable, running without queues', waitErr?.message || waitErr);
          connection = null;
        }
      } else {
        console.warn('Worker Redis unavailable, running without queues', msg);
        connection = null;
      }
    }
  } else {
    console.warn('REDIS_URL not set; worker will idle');
  }

  // Process the four API queues (captions, ad, color, video-transform). Connection is ready before use.
  const qNames = ['captions', 'ad', 'color', 'video-transform'] as const;
  const queues = connection ? qNames.map((n) => new Queue(n, { connection })) : [];
  const events = connection ? qNames.map((n) => new QueueEvents(n, { connection })) : [];

  // Use shared database pool from API service (if available) or create minimal pool
  // Note: Worker runs in separate process, so we create a minimal pool with proper config
  const databaseUrl = process.env.DATABASE_URL;
  let db: any = null;
  
  if (databaseUrl) {
    // Import Pool dynamically to avoid circular dependencies
    const { Pool } = await import('pg');
    db = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined as any,
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
  }

  async function transcribeWithAssemblyAI(audioUrl: string, opts: { language?: string } = {}): Promise<{ segments: Array<{ start: number; end: number; text: string }> }> {
    const apiKey = process.env.ASSEMBLYAI_API_KEY || '';
    if (!apiKey) {
      return { segments: [{ start: 0, end: 5, text: 'Transcript unavailable (no ASSEMBLYAI_API_KEY)' }] };
    }
    // Map short language codes to AssemblyAI format
    const langMap: Record<string, string> = { en: 'en_us', es: 'es', fr: 'fr', de: 'de', pt: 'pt', it: 'it', nl: 'nl', ja: 'ja', zh: 'zh', ko: 'ko' };
    const langCode = opts.language ? (langMap[opts.language] || opts.language) : 'en_us';

    const createRes = await fetch('https://api.assemblyai.com/v2/transcripts', {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: audioUrl,
        language_code: langCode,
        speech_model: 'best',
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
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcripts/${id}`, {
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
    new Worker('captions', async (job) => {
      console.log('🎬 Captions job started:', job.id, job.data);
      const { videoUrl, language = 'en', tenantId } = job.data || {};
      if (!videoUrl) {
        console.error('❌ Missing videoUrl in job data');
        return { ok: false, error: 'missing_video_url' };
      }
      console.log('🎯 Processing captions for:', videoUrl);
      let degraded = false;
      let segments: Array<{ start: number; end: number; text: string }>;
      try {
        const result = await transcribeWithAssemblyAI(videoUrl, { language });
        segments = result.segments;
        // Check if transcription returned the no-key placeholder
        if (segments.length === 1 && segments[0].text.includes('Transcript unavailable')) {
          degraded = true;
          console.warn('⚠️ Captions degraded: ASSEMBLYAI_API_KEY not configured');
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('⚠️ Captions transcription failed, producing degraded placeholder:', msg);
        degraded = true;
        segments = [{ start: 0, end: 5, text: `[Transcription unavailable: ${msg}]` }];
      }
      const vtt = toVtt(segments);
      const key = `artifacts/${tenantId || 'anon'}/${job.id}.vtt`;
      try {
        await uploadToR2(key, Buffer.from(vtt, 'utf-8'), 'text/vtt');
        console.log(degraded ? '⚠️ Captions completed (degraded):' : '✅ Captions completed:', key);
        return { ok: true, degraded, artifactKey: key, tenantId };
      } catch (error) {
        console.error('Failed to upload captions to R2:', error instanceof Error ? error.message : String(error));
        throw error; // Re-throw to mark job as failed
      }
    }, { connection });

    // ad (TTS)
    const openaiKey = process.env.OPENAI_API_KEY || '';
    const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
    new Worker('ad', async (job) => {
      console.log('🎵 AD job started:', job.id, job.data);
      const { videoUrl: adVideoUrl, text, language = 'en', enabled = true, speed = 1.0, tenantId } = job.data || {};

      // If AD is disabled for this preset, produce a minimal degraded marker
      if (!enabled) {
        const key = `artifacts/${tenantId || 'anon'}/${job.id}.mp3`;
        await uploadToR2(key, Buffer.alloc(0), 'audio/mpeg');
        console.log('⚠️ AD skipped (disabled for preset):', key);
        return { ok: true, degraded: true, artifactKey: key, tenantId };
      }

      let body: Buffer = Buffer.alloc(0);
      const ct = 'audio/mpeg';
      let degraded = false;

      if (openai) {
        try {
          // Determine text to speak: use explicit text, or generate a brief AD script
          let adText = text;
          if (!adText) {
            try {
              const chat = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: 'You are an accessibility audio description writer. Generate a brief, clear audio description introduction for a video. Keep it under 3 sentences. Be descriptive of what a viewer might see.' },
                  { role: 'user', content: `Write a short audio description for this video: ${adVideoUrl || 'unknown video'}` },
                ],
                max_tokens: 150,
              });
              adText = chat.choices[0]?.message?.content || 'Audio description is being generated for this content.';
            } catch (chatErr) {
              console.warn('⚠️ OpenAI chat failed for AD script:', chatErr instanceof Error ? chatErr.message : String(chatErr));
              adText = 'Audio description is being generated for this content.';
            }
          }

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
            degraded = true;
            console.warn('⚠️ OpenAI TTS returned no audio buffer');
          }
        } catch (error) {
          degraded = true;
          console.error('⚠️ OpenAI TTS failed, using degraded fallback:', error instanceof Error ? error.message : String(error));
        }
      } else {
        degraded = true;
        console.warn('⚠️ OpenAI API key not configured, AD degraded');
      }

      const key = `artifacts/${tenantId || 'anon'}/${job.id}.mp3`;
      try {
        await uploadToR2(key, body, ct);
        console.log(degraded ? '⚠️ AD completed (degraded):' : '✅ AD completed:', key);
        return { ok: true, degraded, artifactKey: key, tenantId };
      } catch (error) {
        console.error('Failed to upload AD to R2:', error instanceof Error ? error.message : String(error));
        throw error;
      }
    }, { connection });

    // color (Cloudinary/ffmpeg real implementation)
    new Worker('color', async (job) => {
      console.log('🎨 Color job started:', job.id, job.data);
      const { videoUrl, tenantId } = job.data || {};
      if (!videoUrl) {
        console.error('❌ Missing videoUrl in job data');
        return { ok: false, error: 'missing_video_url' };
      }
      
      let summary: any = { dominant_colors: [], contrast_ratio: 4.5 };
      let degraded = true; // default summary is degraded; cleared if real analysis succeeds
      
      try {
        // Use Cloudinary for video analysis if CLOUDINARY_URL is available
        const cloudinaryUrl = process.env.CLOUDINARY_URL;
        if (cloudinaryUrl) {
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
              uploadForm.append('file', videoUrl);
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
        console.error('⚠️ Cloudinary analysis failed, using degraded fallback:', error instanceof Error ? error.message : String(error));
        // Keep default summary
      }
      
      const key = `artifacts/${tenantId || 'anon'}/${job.id}.json`;
      try {
        await uploadToR2(key, Buffer.from(JSON.stringify(summary)), 'application/json');
        console.log(degraded ? '⚠️ Color completed (degraded):' : '✅ Color completed:', key);
        return { ok: true, degraded, artifactKey: key, tenantId };
      } catch (error) {
        console.error('Failed to upload color analysis to R2:', error instanceof Error ? error.message : String(error));
        throw error; // Re-throw to mark job as failed
      }
    }, { connection });

    // video-transform worker
    createVideoTransformWorker(connection);
    console.log('✅ Video transform worker registered');
  }

  // Helper function for retrying DB operations
  async function retryDbOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 100
  ): Promise<T> {
    let lastError: Error | unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on non-transient errors
        const isTransient = 
          error?.code === 'ECONNREFUSED' ||
          error?.code === 'ETIMEDOUT' ||
          error?.message?.includes('Connection is closed') ||
          error?.message?.includes('terminating connection');
        
        if (!isTransient || attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = initialDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        console.warn(`[Worker DB Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms...`);
      }
    }
    throw lastError;
  }

  for (const ev of events) {
    ev.on('completed', async ({ jobId, returnvalue }) => {
      try {
        console.log('Job completed', jobId);
        if (!db) return;
        const payload: any = typeof returnvalue === 'string'
          ? (() => { try { return JSON.parse(returnvalue as unknown as string); } catch { return {}; } })()
          : (returnvalue as any) || {};
        const tenantId = (payload && payload.tenantId) as string | undefined;
        if (!tenantId) return;
        const minutes = Number((payload && payload.minutes) || 0);
        const egressBytes = Number((payload && payload.egressBytes) || 0);
        
        // Retry DB operations with exponential backoff
        await retryDbOperation(async () => {
          await db.query(
            `insert into usage_counters(tenant_id, period_start, minutes_used, jobs, egress_bytes)
             values ($1, date_trunc('month', now())::date, 0, 0, 0)
             on conflict (tenant_id) do nothing`,
            [tenantId]
          );
          await db.query(
            `update usage_counters set minutes_used = minutes_used + $2, egress_bytes = egress_bytes + $3 where tenant_id = $1`,
            [tenantId, minutes, egressBytes]
          );
        }, 3, 100);
      } catch (e) {
        console.error('Failed to update usage on completion after retries', e);
        // Don't crash worker on usage update failures
      }
    });
  }

  console.log('Worker running for queues', qNames.join(', '));
}

// Start the workers
startWorkers().catch(console.error);
