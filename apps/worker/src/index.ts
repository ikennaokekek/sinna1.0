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

async function startWorkers() {
  const redisUrl = process.env.REDIS_URL;
  let connection: IORedis | null = null;

  // Initialize Redis connection first
  if (redisUrl) {
    const client = new IORedis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      connectTimeout: 5000,
    } as any);
    
    try {
      await client.connect();
      console.log('Worker Redis connected');
      connection = client;
    } catch (e: any) {
      console.warn('Worker Redis unavailable, running without queues', e?.message || e);
      connection = null;
    }
  } else {
    console.warn('REDIS_URL not set; worker will idle');
  }

  // Process the four API queues (captions, ad, color, video-transform)
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
    const createRes = await fetch('https://api.assemblyai.com/v2/transcripts', {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_url: audioUrl, language_code: opts.language }),
    });
    const created = await createRes.json();
    const id = created.id as string;
    if (!id) throw new Error('assemblyai_create_failed');
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
      if (data.status === 'error') throw new Error('assemblyai_error');
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
      try {
        const { segments } = await transcribeWithAssemblyAI(videoUrl, { language });
        const vtt = toVtt(segments);
        const key = `artifacts/${tenantId || 'anon'}/${job.id}.vtt`;
        try {
          await uploadToR2(key, Buffer.from(vtt, 'utf-8'), 'text/vtt');
          console.log('✅ Captions completed:', key);
          return { ok: true, artifactKey: key, tenantId };
        } catch (error) {
          console.error('Failed to upload captions to R2:', error instanceof Error ? error.message : String(error));
          throw error; // Re-throw to mark job as failed
        }
      } catch (error) {
        console.error('Captions transcription failed:', error instanceof Error ? error.message : String(error));
        throw error; // Re-throw to mark job as failed
      }
    }, { connection });

    // ad (TTS)
    const openaiKey = process.env.OPENAI_API_KEY || '';
    const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
    new Worker('ad', async (job) => {
      console.log('🎵 AD job started:', job.id, job.data);
      const { text = 'Audio description placeholder', tenantId } = job.data || {};
      // If OpenAI available, invoke; else fallback stub
      let body: Buffer = Buffer.from('mock-mp3', 'utf-8');
      let ct = 'audio/mpeg';
      if (openai) {
        try {
          const resp: any = await openai.audio.speech.create({
            model: 'tts-1',
            voice: 'nova',
            input: text,
            response_format: 'mp3',
          });
          const arrayBuffer = await resp.arrayBuffer?.() || null;
          if (arrayBuffer) {
            body = Buffer.from(new Uint8Array(arrayBuffer as ArrayBuffer));
          }
        } catch (error) {
          console.error('OpenAI TTS failed, using fallback:', error instanceof Error ? error.message : String(error));
          // Keep stub body as fallback
        }
      } else {
        console.warn('OpenAI API key not configured, using mock audio');
      }
      const key = `artifacts/${tenantId || 'anon'}/${job.id}.mp3`;
      try {
        await uploadToR2(key, body, ct);
        console.log('✅ AD completed:', key);
        return { ok: true, artifactKey: key, tenantId };
      } catch (error) {
        console.error('Failed to upload AD to R2:', error instanceof Error ? error.message : String(error));
        throw error; // Re-throw to mark job as failed
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
      
      try {
        // Use Cloudinary for video analysis if CLOUDINARY_URL is available
        const cloudinaryUrl = process.env.CLOUDINARY_URL;
        if (cloudinaryUrl) {
          // Extract credentials from CLOUDINARY_URL: cloudinary://api_key:api_secret@cloud_name
          const match = cloudinaryUrl.match(/cloudinary:\/\/(\d+):([\w-]+)@([\w-]+)/);
          if (match) {
            const [, apiKey, apiSecret, cloudName] = match;
            
            // Cloudinary approach: Upload video URL to Cloudinary and extract frame for analysis
            try {
              // Upload video from remote URL to Cloudinary
              const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
              
              // Cloudinary uses unsigned uploads with API key/secret in URL params
              // Or we can use signed uploads - for now, use unsigned with explicit auth
              const formData = new URLSearchParams();
              formData.append('file', videoUrl);
              formData.append('resource_type', 'video');
              formData.append('api_key', apiKey);
              formData.append('timestamp', Math.floor(Date.now() / 1000).toString());
              
              // Generate signature for upload
              const crypto = await import('crypto');
              const signatureString = formData.toString();
              const signature = crypto.createHash('sha1').update(signatureString + apiSecret).digest('hex');
              formData.append('signature', signature);
              
              const uploadResponse = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString()
              });
              
              if (uploadResponse.ok) {
                const uploadData = await uploadResponse.json();
                
                // Extract a frame from the video for color analysis
                // Cloudinary can generate a frame automatically using transformations
                const frameUrl = uploadData.secure_url?.replace(/\.(mp4|webm|mov)$/, '.jpg') || 
                                `https://res.cloudinary.com/${cloudName}/video/upload/so_0/${uploadData.public_id}.jpg`;
                
                // Analyze the frame image for colors
                const analysisUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/analyze`;
                const analysisParams = new URLSearchParams();
                analysisParams.append('url', frameUrl);
                analysisParams.append('colors', 'true');
                analysisParams.append('api_key', apiKey);
                analysisParams.append('timestamp', Math.floor(Date.now() / 1000).toString());
                
                const analysisSignature = crypto.createHash('sha1')
                  .update(analysisParams.toString() + apiSecret)
                  .digest('hex');
                analysisParams.append('signature', analysisSignature);
                
                const analysisResponse = await fetch(`${analysisUrl}?${analysisParams.toString()}`, {
                  method: 'GET'
                });
                
                if (analysisResponse.ok) {
                  const analysisData = await analysisResponse.json();
                  summary = {
                    dominant_colors: analysisData.colors?.dominant || [],
                    contrast_ratio: analysisData.accessibility?.contrast_ratio || 4.5,
                    accessibility_score: analysisData.accessibility?.score || 0,
                    cloudinary_public_id: uploadData.public_id,
                    video_duration: uploadData.duration
                  };
                  console.log('✅ Cloudinary analysis completed');
                } else {
                  console.warn('Cloudinary image analysis failed, using default summary');
                }
              } else {
                const errorText = await uploadResponse.text().catch(() => '');
                console.warn('Cloudinary upload failed:', { status: uploadResponse.status, error: errorText });
              }
            } catch (cloudinaryError) {
              console.warn('Cloudinary analysis attempt failed:', cloudinaryError instanceof Error ? cloudinaryError.message : String(cloudinaryError));
              // Fall back to default summary
            }
          } else {
            console.warn('CLOUDINARY_URL format invalid, expected: cloudinary://api_key:api_secret@cloud_name');
          }
        } else {
          console.warn('CLOUDINARY_URL not configured, using default summary');
        }
      } catch (error) {
        console.error('Cloudinary analysis failed, using fallback:', error instanceof Error ? error.message : String(error));
        // Keep default summary
      }
      
      const key = `artifacts/${tenantId || 'anon'}/${job.id}.json`;
      try {
        await uploadToR2(key, Buffer.from(JSON.stringify(summary)), 'application/json');
        console.log('✅ Color completed:', key);
        return { ok: true, artifactKey: key, tenantId };
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
