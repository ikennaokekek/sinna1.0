import 'dotenv/config';
import Fastify from 'fastify';
import { z } from 'zod';
import { Registry, collectDefaultMetrics, Histogram, Gauge, Counter } from 'prom-client';
import fastifySwagger from '@fastify/swagger';
import fastifyCors from '@fastify/cors';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { getSignedGetUrl } from './lib/r2';
import * as fs from 'fs';
import * as path from 'path';
import IORedis from 'ioredis';
import crypto from 'crypto';
// duplicate imports removed
import { Queue } from 'bullmq';
import Stripe from 'stripe';
import * as Sentry from '@sentry/node';
import fastifyRawBody from 'fastify-raw-body';
import { sendEmailNotice } from './lib/email';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { getDb, runMigrations } from './lib/db';
import { hashKey } from './lib/auth';
import { incrementAndGateUsage } from './lib/usage';
import { isProduction } from './config/env';

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024,
  trustProxy: process.env.TRUST_PROXIES === '1',
});

// Ensure rawBody is available for routes like Stripe webhooks (signature verification)
app.register(fastifyRawBody, {
  field: 'rawBody',
  global: false,
  encoding: false,
  runFirst: true,
});

// Sentry error monitoring (optional via SENTRY_DSN)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
}

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

// CORS
try {
  const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  app.register(fastifyCors, {
    origin: origins.length ? origins : true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    credentials: true,
  });
} catch (e) {
  app.log.warn({ err: e }, 'Failed to register CORS');
}

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

// Auth preHandler: validate API key, check subscription/grace, attach tenantId
app.addHook('preHandler', async (req, reply) => {
  // Allow public health/readiness/metrics/docs and Stripe webhooks to bypass auth
  if (
    req.url === '/webhooks/stripe' ||
    req.url === '/health' ||
    req.url === '/readiness' ||
    req.url === '/metrics' ||
    req.url.startsWith('/api-docs')
  ) {
    return;
  }
  const key = req.headers['x-api-key'];
  if (typeof key !== 'string') return reply.code(401).send({ code: 'unauthorized' });
  const h = hashKey(key);
  const { pool } = getDb();
  const { rows } = await pool.query(
    'select t.id as tenant_id, t.active, t.grace_until from api_keys k join tenants t on t.id=k.tenant_id where k.key_hash=$1',
    [h]
  );
  const row = rows[0];
  if (!row) return reply.code(401).send({ code: 'unauthorized' });
  const now = new Date();
  const inGrace = row.grace_until && now < new Date(row.grace_until);
  if (!row.active && !inGrace) return reply.code(402).send({ code: 'payment_required' });
  (req as any).tenantId = row.tenant_id as string;
});

app.get('/health', async () => ({ ok: true, uptime: process.uptime() }));

// Readiness probe: quick DB ping only
app.get('/readiness', async (_req, reply) => {
  try {
    const { pool } = getDb();
    await pool.query('select 1');
    return reply.send({ db: 'up' });
  } catch (e) {
    return reply.code(503).send({ db: 'down' });
  }
});

// Demo endpoint and status header
app.addHook('onSend', async (req, reply, payload) => {
  reply.header('X-Status-Page', process.env.STATUS_PAGE_URL || 'https://status.yourdomain');
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
// Rate limit (rate-limiter-flexible): single global limiter with bypass + headers
const redis = new IORedis(process.env.REDIS_URL!);
const pointsPerMinute = 120;
const limiter = new RateLimiterRedis({
  storeClient: redis as any,
  points: pointsPerMinute,
  duration: 60,
  keyPrefix: 'rlf:global',
  execEvenly: true,
  blockDuration: 0,
  insuranceLimiter: new RateLimiterMemory({ points: pointsPerMinute, duration: 60 }),
});

const trustedCidrs = (process.env.TRUSTED_CIDRS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  return (
    ((parseInt(parts[0] || '0', 10) & 255) << 24) >>> 0 |
    ((parseInt(parts[1] || '0', 10) & 255) << 16) |
    ((parseInt(parts[2] || '0', 10) & 255) << 8) |
    (parseInt(parts[3] || '0', 10) & 255)
  ) >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  if (ip.includes(':')) return false; // skip IPv6 for simplicity
  const [range, prefixStr] = cidr.split('/');
  if (!range) return false;
  if (!prefixStr) return ip === range;
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  return (ipInt & mask) === (rangeInt & mask);
}

function isTrustedByCidr(ip: string): boolean {
  if (!trustedCidrs.length) return false;
  return trustedCidrs.some((cidr) => {
    try { return isIpInCidr(ip, cidr); } catch { return false; }
  });
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function isHmacTrusted(req: any): boolean {
  const secret = process.env.WEBHOOK_SIGNING_SECRET || '';
  if (!secret) return false;
  const headerName = (process.env.WEBHOOK_HMAC_HEADER || 'x-webhook-signature').toLowerCase();
  const sigHeader = (req.headers[headerName] as string | undefined) || '';
  if (!sigHeader) return false;
  const provided = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader;
  const raw = (req as any).rawBody ? (req as any).rawBody as Buffer : Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return constantTimeEquals(expected, provided);
}

function getClientKey(req: any): string {
  return (req as any).tenantId || req.ip;
}

app.addHook('preHandler', async (req, reply) => {
  // Skip rate limiting for public health/readiness/metrics/docs routes and Stripe webhooks
  if (
    req.url === '/health' ||
    req.url === '/readiness' ||
    req.url === '/metrics' ||
    req.url.startsWith('/api-docs') ||
    req.url === '/webhooks/stripe'
  ) {
    return;
  }

  // Bypass if from trusted CIDR or HMAC-verified webhook
  if (isTrustedByCidr(req.ip) || isHmacTrusted(req)) {
    return;
  }

  const key = getClientKey(req);
  try {
    const res = await limiter.consume(key, 1);
    reply.header('X-RateLimit-Limit', pointsPerMinute);
    reply.header('X-RateLimit-Remaining', Math.max(0, res.remainingPoints));
  } catch (rej: any) {
    const retrySec = Math.ceil((rej.msBeforeNext || 1000) / 1000);
    reply.header('Retry-After', retrySec);
    return reply.code(429).send({ code: 'rate_limited', retry_after_seconds: retrySec });
  }
});

// Simple in-memory tenant store (demo)
type TenantState = { active: boolean; graceUntil?: number; usage: { requests: number; minutes: number; jobs: number; storage: number; cap: number }; customerId?: string };
const tenants = new Map<string, TenantState>();

// Subscription gating now handled in the auth preHandler above

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

  // Usage gate: count one job before enqueue; 429 if exceeding caps
  try {
    const gate = await incrementAndGateUsage(tenantId, { jobs: 1 });
    if (gate.blocked) {
      return res.code(429).send({ code: 'rate_limited', reason: gate.reason });
    }
  } catch (err) {
    req.log.warn({ err }, 'usage gate failed');
  }

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
  try {
    const { pool } = getDb();
    // ensure row exists for current month
    await pool.query(
      `insert into usage_counters(tenant_id, period_start, minutes_used, jobs, egress_bytes)
       values ($1, date_trunc('month', now())::date, 0, 0, 0)
       on conflict (tenant_id) do nothing`,
      [tenantId]
    );
    await pool.query(
      `update usage_counters
       set jobs = jobs + 1
       where tenant_id = $1`,
      [tenantId]
    );
  } catch (e) {
    req.log.warn({ err: e }, 'Failed to persist usage counters');
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

// Raw-body Stripe webhook route (tolerate missing keys to avoid boot failure)
const stripeKey = process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2023-10-16' }) : null;

app.post('/webhooks/stripe', { config: { rawBody: true } }, async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_LIVE || process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!stripe || !webhookSecret) {
    return res.code(503).send({ success: false, error: 'stripe_unconfigured' });
  }
  const rawBody = (req as any).rawBody;
  let event: Stripe.Event;
  try {
    event = (stripe as Stripe).webhooks.constructEvent(rawBody, sig, webhookSecret);
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

// Capture unhandled errors
app.addHook('onError', async (req, _reply, err) => {
  try {
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err, {
        extra: { url: req.url, method: req.method, tenantId: (req as any).tenantId },
      } as any);
    }
  } catch {}
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

async function start() {
  try {
    if (process.env.RUN_MIGRATIONS_ON_BOOT === '1') {
      await runMigrations();
      app.log.info('DB migrations completed');
    }
    // Sanity check: print environment
    // eslint-disable-next-line no-console
    console.log('env:', process.env.NODE_ENV);
    // Startup environment info (no secrets)
    app.log.info({ env: process.env.NODE_ENV || 'development', stripeLiveKeyPresent: isProduction() ? !!process.env.STRIPE_SECRET_KEY_LIVE : false }, 'Startup environment');
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info({ port }, 'API listening');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();


