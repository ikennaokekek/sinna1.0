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
import { Pool } from 'pg';

const redisUrl = process.env.REDIS_URL;
let connection: IORedis | null = null;
if (redisUrl) {
  const client = new IORedis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableReadyCheck: false,
    retryStrategy: () => null,
    connectTimeout: 1000,
  } as any);
  client.connect().then(() => {
    console.log('Worker Redis connected');
  }).catch((e) => {
    console.warn('Worker Redis unavailable, running without queues', e?.message || e);
  });
  connection = client as any;
} else {
  console.warn('REDIS_URL not set; worker will idle');
}

// Process the three API queues (must match API queue names)
const qNames = ['captions', 'ad', 'color'] as const;
const queues = connection ? qNames.map((n) => new Queue(n, { connection })) : [];
const events = connection ? qNames.map((n) => new QueueEvents(n, { connection })) : [];

// Minimal DB client for usage updates
const databaseUrl = process.env.DATABASE_URL;
const db = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined as any,
    })
  : null;

if (connection) {
  async function transcribeWithAssemblyAI(audioUrl: string, opts: { language?: string } = {}): Promise<{ segments: Array<{ start: number; end: number; text: string }> }> {
    const apiKey = process.env.ASSEMBLYAI_API_KEY || '';
    if (!apiKey) {
      // fallback stub
      return { segments: [{ start: 0, end: 5, text: 'Transcript unavailable (no ASSEMBLYAI_API_KEY)' }] };
    }
    // create transcript
    const createRes = await fetch('https://api.assemblyai.com/v2/transcripts', {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_url: audioUrl, language_code: opts.language }),
    });
    const created = await createRes.json();
    const id = created.id as string;
    if (!id) throw new Error('assemblyai_create_failed');
    // poll for completion
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
          // group words into ~3s chunks
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

  new Worker('captions', async (job) => {
    const { videoUrl, language = 'en', tenantId } = job.data || {};
    if (!videoUrl) return { ok: false, error: 'missing_video_url' };
    const { segments } = await transcribeWithAssemblyAI(videoUrl, { language });
    const vtt = toVtt(segments);
    const key = `artifacts/${tenantId || 'anon'}/${job.id}.vtt`;
    await uploadToR2(key, Buffer.from(vtt, 'utf-8'), 'text/vtt');
    return { ok: true, artifactKey: key, tenantId };
  }, { connection });

  new Worker(
    'ad',
    async (job) => {
      // Placeholder: would call TTS; return mock artifact for now
      const key = `artifacts/${job.data?.tenantId || 'anon'}/${job.id}.mp3`;
      await uploadToR2(key, Buffer.from('mock-mp3', 'utf-8'), 'audio/mpeg');
      return { ok: true, artifactKey: key, tenantId: job.data?.tenantId };
    },
    { connection },
  );

  new Worker(
    'color',
    async (job) => {
      // Placeholder: color analysis; store JSON summary
      const summary = { dominant_colors: [], contrast_ratio: 4.5 };
      const key = `artifacts/${job.data?.tenantId || 'anon'}/${job.id}.json`;
      await uploadToR2(key, Buffer.from(JSON.stringify(summary)), 'application/json');
      return { ok: true, artifactKey: key, tenantId: job.data?.tenantId };
    },
    { connection },
  );
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
    } catch (e) {
      console.error('Failed to update usage on completion', e);
    }
  });
}

console.log('Worker running for queues', qNames.join(', '));


