import Fastify from 'fastify';
import { z } from 'zod';
import { Registry, collectDefaultMetrics, Histogram, Gauge, Counter } from 'prom-client';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { getSignedGetUrl } from './lib/r2';
import fs from 'fs';
import path from 'path';
import IORedis from 'ioredis';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Queue } from 'bullmq';
import Stripe from 'stripe';
import { sendEmailNotice } from './lib/email';
import { RedisTokenBucket } from './lib/rateLimit';

const app = Fastify({ logger: true });

// Startup guard: env.example must contain placeholders only
try {
  const envExamplePath = path.join(process.cwd(), 'env.example');
  if (fs.existsSync(envExamplePath)) {
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    const placeholderIndicators = ['<', '>', '__', 'xxx', 'change-me'];
    const keysToCheck = [
      'REDIS_URL',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'ASSEMBLYAI_API_KEY',
      'OPENAI_API_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'SENTRY_DSN',
      'JWT_SECRET',
      'DATABASE_URL',
      'CLOUDINARY_URL'
    ];
    const lines = content.split(/\r?\n/);
    const violations: { key: string; sample: string }[] = [];
    for (const key of keysToCheck) {
      const line = lines.find((l) => l.startsWith(`${key}=`));
      if (!line) continue;
      const value = line.slice(key.length + 1).trim();
      if (!value) continue;
      const hasPlaceholder = placeholderIndicators.some((ind) => value.includes(ind));
      if (!hasPlaceholder) {
        violations.push({ key, sample: value.length > 64 ? value.slice(0, 64) + '…' : value });
      }
    }
    if (violations.length > 0) {
      app.log.error({ violations }, 'env.example contains non-placeholder values');
      // Throw to abort boot
      throw new Error('env.example must contain placeholders only. Move real secrets to .env or Render.');
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
}
// Swagger (OpenAPI) docs for Fastify API
app.register(fastifySwagger, {
  openapi: {
    info: { title: 'Sinna API', version: '1.0.0' },
    servers: [{ url: process.env.BASE_URL || 'http://localhost:4000' }]
  }
});
app.register(fastifySwaggerUi, { routePrefix: '/api-docs', uiConfig: { docExpansion: 'list' } });

// Prometheus metrics for API
const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'sinna_api_' });
const jobLatency = new Histogram({ name: 'job_latency_ms', help: 'Job latency in ms', registers: [registry], buckets: [100,500,1000,5000,10000,60000] });
const queueDepth = new Gauge({ name: 'queue_depth', help: 'Queue depth per queue', labelNames: ['queue'], registers: [registry] });
const failuresTotal = new Counter({ name: 'failures_total', help: 'Total failures', labelNames: ['type'], registers: [registry] });

app.get('/metrics', async (req, res) => {
  res.header('Content-Type', registry.contentType);
  return res.send(await registry.metrics());
});

// Simple auth and tenant extraction
app.addHook('preHandler', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    res.code(401).send({ success: false, error: 'Missing API key' });
    return;
  }
  (req as any).tenantId = `t_${apiKey.slice(-8)}`;
});

app.get('/health', async () => ({ status: 'ok' }));

// Demo endpoint and status header
app.addHook('onSend', async (req, reply, payload) => {
  reply.header('X-Status-Page', process.env.STATUS_PAGE_URL || 'https://status.sinna.dev');
  return payload as any;
});

app.get('/v1/demo', async () => ({
  message: 'Welcome to Sinna API',
  quickstart: {
    createJob: 'POST /v1/jobs { source_url, preset_id? }',
    pollJob: 'GET /v1/jobs/{id}',
    usage: 'GET /v1/me/usage'
  }
}));
// Rate limit (Redis token bucket) per-tenant
const redisUrl = process.env.REDIS_URL;
let redis: IORedis | null = null;
if (redisUrl) {
  redis = new IORedis(redisUrl);
  const bucket = new RedisTokenBucket(redis, 60, 60, 60);
  app.addHook('preHandler', async (req, res) => {
    const tenantId = (req as any).tenantId as string;
    try {
      const { remaining, resetSec } = await bucket.consume(`tenant:${tenantId}`);
      if (remaining <= 0) {
        res.code(429).send({ success: false, error: 'Rate limit exceeded', details: { resetSec } });
        return;
      }
    } catch {
      // if redis unavailable, skip rate limiting
    }
  });
}

// Simple in-memory tenant store (demo)
type TenantState = { active: boolean; graceUntil?: number; usage: { requests: number; minutes: number; jobs: number; storage: number; cap: number }; customerId?: string };
const tenants = new Map<string, TenantState>();

// Middleware: block POST if not active or grace
app.addHook('preHandler', async (req, res) => {
  if (req.method !== 'POST') return;
  if (process.env.ALLOW_UNPAID === 'true') return; // CI/dev bypass
  const tenantId = (req as any).tenantId as string;
  const state = tenants.get(tenantId);
  const now = Date.now();
  const inGrace = state?.graceUntil && state.graceUntil > now;
  if (!state?.active && !inGrace) {
    res.code(402).send({ success: false, error: 'Subscription required or grace expired' });
    return;
  }
});

// BullMQ queues (same names as backend)
const captionsQ: any = redis ? new Queue('captionsQ', { connection: redis }) : {
  add: async (_name: string, _data: any) => ({ id: `stub-${Date.now()}-c` }),
  count: async () => 0,
};
const adQ: any = redis ? new Queue('adQ', { connection: redis }) : {
  add: async (_name: string, _data: any) => ({ id: `stub-${Date.now()}-a` }),
  count: async () => 0,
};
const colorQ: any = redis ? new Queue('colorQ', { connection: redis }) : {
  add: async (_name: string, _data: any) => ({ id: `stub-${Date.now()}-col` }),
  count: async () => 0,
};

// POST /v1/jobs: validate, idempotency, enqueue pipeline
app.post('/v1/jobs', async (req, res) => {
  const Body = z.object({
    source_url: z.string().url(),
    preset_id: z.string().optional(),
  });
  const body = Body.parse(req.body);
  const tenantId = (req as any).tenantId as string;

  // idempotency key: sha256(source_url+preset+tenant)
  const idemKey = crypto.createHash('sha256').update(`${body.source_url}|${body.preset_id || ''}|${tenantId}`).digest('hex');
  const idemCacheKey = `jobs:idempotency:${idemKey}`;
  let existing: string | null = null;
  if (redis) existing = await redis.get(idemCacheKey);
  if (existing) {
    return res.code(200).send({ success: true, data: JSON.parse(existing), message: 'Idempotent replay' });
  }

  // derive defaults from preset
  const preset = (body.preset_id || 'everyday').toLowerCase();
  const presetsPath = path.join(__dirname, '..', '..', '..', 'config', 'presets.json');
  let presets: any = {};
  try { presets = JSON.parse(fs.readFileSync(presetsPath, 'utf-8')); } catch {}
  const presetCfg = presets[preset] || presets['everyday'] || { subtitleFormats: ['vtt','srt','ttml'] };
  const language = 'en';
  const captionFormat = 'vtt';

  // enqueue pipeline: captions -> ad -> color
  const captionJob = await captionsQ.add('generate-subtitles', {
    videoUrl: body.source_url,
    language,
    format: captionFormat,
    formats: presetCfg.subtitleFormats,
    captionStyle: presetCfg.captionStyle,
    burnIn: !!presetCfg.burnIn,
    tenantId,
    userId: tenantId,
  });

  const adJob = await adQ.add('generate-audio-description', {
    videoUrl: body.source_url,
    language,
    enabled: !!presetCfg.adEnabled,
    speed: presetCfg.speed || 1.0,
    tenantId,
    userId: tenantId,
    dependsOn: captionJob.id,
  });

  const colorJob = await colorQ.add('analyze-colors', {
    videoUrl: body.source_url,
    colorProfile: presetCfg.colorProfile,
    motionReduce: !!presetCfg.motionReduce,
    strobeReduce: !!presetCfg.strobeReduce,
    tenantId,
    userId: tenantId,
    dependsOn: adJob.id,
  });

  const jobBundle = { id: captionJob.id, steps: { captions: captionJob.id, ad: adJob.id, color: colorJob.id }, preset };
  if (redis) await redis.setex(idemCacheKey, 24 * 3600, JSON.stringify(jobBundle));

  // simple usage counters and cap notices
  const state = tenants.get(tenantId) || { active: true, usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 } } as any;
  state.usage.requests += 1;
  state.usage.jobs += 1;
  tenants.set(tenantId, state);
  const pct = Math.round((state.usage.requests / state.usage.cap) * 100);
  if (pct === 80 || pct === 100) {
    const to = process.env.NOTIFY_FALLBACK_EMAIL || '';
    if (to) await sendEmailNotice(to, `Sinna: Usage ${pct}%`, `Your usage has reached ${pct}% of your cap.`);
  }

  // metrics: update queue depth
  const [cDepth, aDepth, colDepth] = await Promise.all([
    captionsQ.count(), adQ.count(), colorQ.count()
  ]);
  queueDepth.labels({ queue: 'captionsQ' }).set(cDepth);
  queueDepth.labels({ queue: 'adQ' }).set(aDepth);
  queueDepth.labels({ queue: 'colorQ' }).set(colDepth);

  return res.code(201).send({ success: true, data: jobBundle, message: 'Pipeline queued' });
});

// GET /v1/jobs/{id}: summarize pipeline status
app.get('/v1/jobs/:id', async (req, res) => {
  const Params = z.object({ id: z.string() });
  const { id } = Params.parse(req.params);
  const tenantId = (req as any).tenantId as string;

  // Try idempotency cache first
  if (!redis) return res.code(404).send({ success: false, error: 'Job not found' });
  const prefix = 'jobs:idempotency:';
  const stream = (redis as any).scanStream({ match: `${prefix}*` });
  let bundle: any = null;
  for await (const keys of stream) {
    for (const key of keys) {
      const raw = await (redis as any).get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.id === id) bundle = parsed;
      }
    }
  }
  if (!bundle) return res.code(404).send({ success: false, error: 'Job not found' });

  const [c, a, cl] = await Promise.all([
    captionsQ.getJob(bundle.steps.captions),
    adQ.getJob(bundle.steps.ad),
    colorQ.getJob(bundle.steps.color),
  ]);

  const status = {
    captions: c?.isCompleted() ? 'completed' : c?.failedReason ? 'failed' : 'pending',
    ad: a?.isCompleted() ? 'completed' : a?.failedReason ? 'failed' : 'pending',
    color: cl?.isCompleted() ? 'completed' : cl?.failedReason ? 'failed' : 'pending',
  };

  // metrics
  if (c?.failedReason || a?.failedReason || cl?.failedReason) {
    failuresTotal.labels({ type: 'job' }).inc();
  }

  const artifacts: any[] = [];
  if (c?.isCompleted()) artifacts.push({ type: 'subtitles', format: 'vtt', url: 'https://example.com/subtitles.vtt' });
  if (a?.isCompleted()) artifacts.push({ type: 'audio_description', format: 'mp3', url: 'https://example.com/ad.mp3' });
  if (cl?.isCompleted()) artifacts.push({ type: 'color_report', format: 'json', url: 'https://example.com/color.json' });

  const exportPackUrl = artifacts.length ? 'https://example.com/export.zip' : null;

  return res.send({ success: true, data: { id, status, artifacts, exportPackUrl } });
});

// GET /v1/me/usage
app.get('/v1/me/usage', async (req, res) => {
  const tenantId = (req as any).tenantId as string;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const state = tenants.get(tenantId) || { usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 } } as TenantState;
  res.send({ success: true, data: { period_start: startOfMonth, period_end: endOfMonth, ...state.usage } });
});

// Raw-body Stripe webhook route
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });
app.addHook('onRequest', async (req, res) => {
  if (req.url === '/webhooks/stripe') {
    // fastify needs rawBody
    // @ts-ignore
    req.raw.setEncoding('utf8');
  }
});

app.post('/webhooks/stripe', { config: { rawBody: true } }, async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  const rawBody = (req as any).rawBody || (req as any).body || '';
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    req.log.error({ err }, 'Stripe signature verification failed');
    return res.code(400).send({ success: false, error: 'Invalid signature' });
  }

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice;
    const tenantId = invoice.customer as string;
    const state = tenants.get(tenantId) || { active: false, usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 } } as TenantState;
    state.active = true;
    state.graceUntil = undefined;
    state.usage.requests = 0; state.usage.minutes = 0; state.usage.jobs = 0; state.usage.storage = 0;
    tenants.set(tenantId, state);
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const tenantId = invoice.customer as string;
    const state = tenants.get(tenantId) || { active: false, usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 } } as TenantState;
    state.active = false;
    const graceDays = parseInt(process.env.GRACE_DAYS || '7', 10);
    state.graceUntil = Date.now() + graceDays * 24 * 3600 * 1000;
    tenants.set(tenantId, state);
    // TODO: email notice (stub)
    req.log.warn({ tenantId }, 'Payment failed - entered grace period');
    const email = (invoice.customer_email || process.env.NOTIFY_FALLBACK_EMAIL || '').toString();
    if (email) await sendEmailNotice(email, 'Sinna: Payment failed, grace period started', `Your subscription payment failed. You have a ${graceDays}-day grace period.`);
  }

  res.send({ received: true });
});

// GET /v1/files/:id:sign -> return signed read URL
app.get('/v1/files/:id:sign', async (req, res) => {
  const params = z
    .object({ id: z.string().min(1), ttl: z.coerce.number().int().positive().optional() })
    .parse({ ...(req.params as any), ...(req.query as any) });

  const ttl = params.ttl ?? 3600;
  const url = await getSignedGetUrl(params.id, ttl);
  return { success: true, data: { url, expires_in: ttl } };
});

const port = Number(process.env.PORT || 4000);

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    app.log.info({ port }, 'API listening');
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });


