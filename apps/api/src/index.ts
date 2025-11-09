import 'dotenv/config';
import Fastify, { FastifyRequest } from 'fastify';
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
import { redisConnection, verifyRedisConnection } from './lib/redis';
import Stripe from 'stripe';
import * as Sentry from '@sentry/node';
import fastifyRawBody from 'fastify-raw-body';
import { sendEmailNotice } from './lib/email';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { getDb, runMigrations, seedTenantAndApiKey } from './lib/db';
import { hashKey } from './lib/auth';
import { incrementAndGateUsage } from './lib/usage';
import { isProduction } from './config/env';
import { validateEnv } from '@sinna/types';
import { AuthenticatedRequest, TenantState } from './types';
import { registerWebhookRoutes } from './routes/webhooks';
import { registerBillingRoutes } from './routes/billing';
import { registerJobRoutes } from './routes/jobs';
import { registerSubscriptionRoutes } from './routes/subscription';
import { requestIdHook } from './middleware/requestId';
import { sendErrorResponse } from './lib/errors';
import { regionLanguageMiddleware } from './middleware/regionLanguage';

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024,
  trustProxy: process.env.TRUST_PROXIES === '1',
});

// Add request ID to all requests
app.addHook('onRequest', requestIdHook);

// Add region-based language detection
app.addHook('onRequest', regionLanguageMiddleware);

// Add performance monitoring
import { performanceMonitoringHook, performanceMonitoringOnSendHook } from './middleware/monitoring';
app.addHook('onRequest', performanceMonitoringHook);
app.addHook('onSend', performanceMonitoringOnSendHook);

// Validate environment early (log and exit on error)
try {
  validateEnv(process.env);
} catch (e: unknown) {
  const error = e instanceof Error ? e : new Error(String(e));
  const errorMessage = error.message || String(e);
  // In development/test mode, just warn instead of exiting
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || process.env.STRIPE_TESTING === 'true') {
    app.log.warn({ message: errorMessage }, '🔧 Development mode: Environment validation warnings');
    app.log.warn('Continuing with lenient validation...');
  } else {
    app.log.error({ message: errorMessage }, 'Invalid environment configuration');
    process.exit(1);
  }
}

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
  app.log.error(e);
  process.exit(1);
}

// CORS
try {
  const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0 && isProduction()) {
    app.log.error('CORS_ORIGINS is required in production');
    process.exit(1);
  }
  app.register(fastifyCors, {
    origin: origins.length ? origins : (isProduction() ? false : true), // Reject all in production if empty
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

// Note: /metrics route is now registered via registerTopLevelRoutes() in start() to ensure Swagger captures it

// Auth preHandler: validate API key, check subscription/grace, attach tenantId
app.addHook('preHandler', async (req, reply) => {
  // Allow public metrics/docs, demo endpoint, billing pages, and Stripe webhooks to bypass auth
  // Test endpoints now require admin authentication
  if (
    req.url.startsWith('/api-docs') ||
    req.url.startsWith('/billing/success') ||
    req.url.startsWith('/billing/cancel') ||
    req.url.startsWith('/webhooks/stripe')
  ) {
    return;
  }
  const key = req.headers['x-api-key'];
  if (typeof key !== 'string') return reply.code(401).send({ code: 'unauthorized' });
  const h = hashKey(key);
  const { pool } = getDb();
  const { rows } = await pool.query(
    'select t.id as tenant_id, t.active, t.status, t.grace_until, t.expires_at from api_keys k join tenants t on t.id=k.tenant_id where k.key_hash=$1',
    [h]
  );
  const row = rows[0];
  if (!row) return reply.code(401).send({ code: 'unauthorized' });
  
  const now = new Date();
  const inGrace = row.grace_until && now < new Date(row.grace_until);
  const isExpired = row.expires_at && now >= new Date(row.expires_at);
  const isActive = row.status === 'active' && row.active && !isExpired;
  
  // Check subscription expiration first
  if (isExpired && !inGrace) {
    return reply.code(401).send({ code: 'subscription_expired', error: 'Your subscription has expired. Please renew to continue using the API.' });
  }
  
  // Check status and active flag
  if (!isActive && !inGrace) {
    return reply.code(402).send({ code: 'payment_required', error: 'Your subscription is not active. Please update your payment method.' });
  }
  
  (req as AuthenticatedRequest).tenantId = row.tenant_id as string;
});

// Note: /health route is now registered via registerTopLevelRoutes() in start() to ensure Swagger captures it

// Test email endpoint (for testing SendGrid/Resend integration) - Admin only
app.post('/test-email', {
  schema: {
    description: 'Test email sending (Admin only)',
    tags: ['System'],
    hide: true, // Hide from Swagger UI (admin endpoint)
    body: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        text: { type: 'string', description: 'Email body text' }
      },
      required: ['to']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          to: { type: 'string' },
          subject: { type: 'string' },
          apiKey: { type: 'string' }
        }
      },
      400: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' }
        }
      },
      403: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' }
        }
      },
      500: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' },
          details: { type: 'string' }
        }
      }
    }
  }
}, async (req, reply) => {
  // Admin authentication check (always enforced; disabled by default in production)
  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_ENDPOINTS_ENABLED !== '1') {
    return reply.code(403).send({ success: false, error: 'Forbidden: Admin endpoints disabled' });
  }
  const adminKey = process.env.ADMIN_API_KEY || '';
  const providedKey = (req.headers['x-admin-key'] as string | undefined) || '';
  if (!adminKey || providedKey !== adminKey) {
    return reply.code(403).send({ success: false, error: 'Forbidden: Admin access required' });
  }
  
  try {
    const body = req.body as { to?: string; subject?: string; text?: string };
    const { to, subject, text } = body;
    
    if (!to) {
      return reply.code(400).send({ success: false, error: 'Email address (to) is required' });
    }
    
    const testEmail = to;
    const testSubject = subject || 'SendGrid connection test';
    
    // Generate a production-ready API key for testing
    const crypto = await import('crypto');
    const randomBytes = crypto.randomBytes(24);
    const randomString = randomBytes.toString('base64')
      .replace(/[+/=]/g, '') // Remove base64 special chars
      .toLowerCase()
      .substring(0, 32); // Ensure consistent length
    
    const apiKey = `sk_live_${randomString}`;
    
    // If custom text is provided, append the API key to it
    let finalText;
    if (text) {
      finalText = `${text}\n\nYour Production API Key: ${apiKey}\n\nBase URL: ${process.env.BASE_URL_PUBLIC || 'https://sinna.site'}\n\nKeep this key secure and use it in the X-API-Key header for all requests.`;
    } else {
      finalText = `✅ Success! Your Render app can send email now.\n\nYour Production API Key: ${apiKey}\n\nBase URL: ${process.env.BASE_URL_PUBLIC || 'https://sinna.site'}\n\nKeep this key secure and use it in the X-API-Key header for all requests.\n\nThis is your actual production-ready API key! 🚀`;
    }
    
    await sendEmailNotice(testEmail, testSubject, finalText);
    
    reply.send({ 
      success: true, 
      message: 'Email sent successfully!',
      to: testEmail,
      subject: testSubject,
      apiKey: apiKey
    });
  } catch (error) {
    req.log.error({ error }, 'Failed to send test email');
    reply.code(500).send({ 
      success: false, 
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get email service status - Admin only
app.get('/email-status', {
  schema: {
    description: 'Get email service configuration status (Admin only)',
    tags: ['System'],
    hide: true, // Hide from Swagger UI (admin endpoint)
    response: {
      200: {
        type: 'object',
        properties: {
          resend_configured: { type: 'boolean' },
          sendgrid_configured: { type: 'boolean' },
          from_email: { type: 'string' },
          services: {
            type: 'object',
            properties: {
              resend: { type: 'string' },
              sendgrid: { type: 'string' }
            }
          }
        }
      },
      403: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          error: { type: 'string' }
        }
      }
    }
  }
}, async (req, reply) => {
  // Admin authentication check (always enforced; disabled by default in production)
  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_ENDPOINTS_ENABLED !== '1') {
    return reply.code(403).send({ success: false, error: 'Forbidden: Admin endpoints disabled' });
  }
  const adminKey = process.env.ADMIN_API_KEY || '';
  const providedKey = (req.headers['x-admin-key'] as string | undefined) || '';
  if (!adminKey || providedKey !== adminKey) {
    return reply.code(403).send({ success: false, error: 'Forbidden: Admin access required' });
  }
  
  const resendKey = process.env.RESEND_API_KEY;
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.NOTIFY_FROM_EMAIL;
  
  reply.send({
    resend_configured: !!resendKey,
    sendgrid_configured: !!sendgridKey,
    from_email: fromEmail || 'not configured',
    services: {
      resend: resendKey ? 'Available' : 'Not configured',
      sendgrid: sendgridKey ? 'Available' : 'Not configured'
    }
  });
});

// Readiness probe: quick DB ping only
app.get('/readiness', {
  schema: {
    description: 'Check if database is ready',
    tags: ['System'],
    security: [{ ApiKeyAuth: [] }],
    response: {
      200: {
        type: 'object',
        properties: {
          db: { type: 'string', enum: ['up'] }
        }
      },
      401: {
        type: 'object',
        properties: {
          code: { type: 'string' }
        }
      },
      503: {
        type: 'object',
        properties: {
          db: { type: 'string', enum: ['down'] }
        }
      }
    }
  }
}, async (req, reply) => {
  const key = req.headers['x-api-key'];
  if (typeof key !== 'string') return reply.code(401).send({ code: 'unauthorized' });
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
  reply.header('X-Status-Page', process.env.STATUS_PAGE_URL || 'https://status.sinna.site');
  return payload;
});

// Note: /v1/demo route is now registered via registerTopLevelRoutes() in start() to ensure Swagger captures it

// Rate limit (rate-limiter-flexible): single global limiter with bypass + headers
const redisUrl = process.env.REDIS_URL;
let redis: IORedis | null = null;
const pointsPerMinute = 120;
let limiter: RateLimiterRedis | RateLimiterMemory = new RateLimiterMemory({ points: pointsPerMinute, duration: 60 });

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

function isHmacTrusted(req: FastifyRequest): boolean {
  const secret = process.env.WEBHOOK_SIGNING_SECRET || '';
  if (!secret) return false;
  const headerName = (process.env.WEBHOOK_HMAC_HEADER || 'x-webhook-signature').toLowerCase();
  const sigHeader = (req.headers[headerName] as string | undefined) || '';
  if (!sigHeader) return false;
  const provided = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader;
  const raw = (req as AuthenticatedRequest).rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return constantTimeEquals(expected, provided);
}

function getClientKey(req: FastifyRequest): string {
  return (req as AuthenticatedRequest).tenantId || req.ip;
}

// Webhook-specific rate limiter (higher limit but still limited)
let webhookLimiter: RateLimiterRedis | RateLimiterMemory = new RateLimiterMemory({ points: 100, duration: 60 });

app.addHook('preHandler', async (req, reply) => {
  // Apply webhook rate limiting separately
  if (req.url === '/webhooks/stripe') {
    try {
      const res = await webhookLimiter.consume(req.ip, 1);
      reply.header('X-RateLimit-Limit', '100');
      reply.header('X-RateLimit-Remaining', Math.max(0, res.remainingPoints));
    } catch (rej: unknown) {
      const rejError = rej as { msBeforeNext?: number };
      const retrySec = Math.ceil((rejError.msBeforeNext || 1000) / 1000);
      reply.header('Retry-After', retrySec);
      return reply.code(429).send({ success: false, error: 'rate_limited', retry_after_seconds: retrySec });
    }
    return; // Skip global rate limiting for webhooks
  }
  
  // Skip rate limiting for public health/readiness/metrics/docs routes
  if (
    req.url === '/health' ||
    req.url === '/readiness' ||
    req.url === '/metrics' ||
    req.url.startsWith('/api-docs')
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
  } catch (rej: unknown) {
    const rejError = rej as { msBeforeNext?: number };
    const retrySec = Math.ceil((rejError.msBeforeNext || 1000) / 1000);
    reply.header('Retry-After', retrySec);
    return reply.code(429).send({ code: 'rate_limited', retry_after_seconds: retrySec });
  }
});

// Simple in-memory tenant store (demo)
const tenants = new Map<string, TenantState>();

// Subscription gating now handled in the auth preHandler above

// BullMQ queues (shared Redis connection)
const captionsQ = new Queue('captions', { connection: redisConnection });
const adQ = new Queue('ad', { connection: redisConnection });
const colorQ = new Queue('color', { connection: redisConnection });
const videoTransformQ = new Queue('video-transform', { connection: redisConnection });

// Stripe client initialization
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2023-10-16' }) : null;

// Register route modules (will be called after redis is initialized in start())
function registerRoutes(): void {
  registerBillingRoutes(app, stripe);
  registerWebhookRoutes(app, stripe, tenants);
  registerSubscriptionRoutes(app);
  // Note: redis will be set in start() function, routes will use it when called
  }

// Register all top-level routes (moved from top-level to ensure Swagger captures them)
function registerTopLevelRoutes(): void {
  // GET /metrics
  app.get('/metrics', {
    schema: {
      description: 'Prometheus metrics endpoint',
      tags: ['System'],
      hide: true, // Hide from Swagger UI
      response: {
        200: {
          type: 'string',
          description: 'Prometheus metrics in text format'
        }
      }
    }
  }, async (req, res) => {
    res.header('Content-Type', registry.contentType);
    return res.send(await registry.metrics());
  });

  // GET /health
  app.get('/health', {
    schema: {
      description: 'Check if server is alive',
      tags: ['System'],
      security: [{ ApiKeyAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            uptime: { type: 'number' }
          }
        },
        401: {
          type: 'object',
          properties: {
            code: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    const key = req.headers['x-api-key'];
    if (typeof key !== 'string') return reply.code(401).send({ code: 'unauthorized' });
    
    // Check Redis status
    const redisStatus = {
      configured: !!process.env.REDIS_URL,
      connected: false,
      queues: false,
    };
    
    if (redisStatus.configured) {
      try {
        // Check BullMQ Redis connection
        const pingResult = await redisConnection.ping().catch(() => null);
        redisStatus.connected = pingResult === 'PONG';
        
        // Check if queues are accessible
        try {
          await captionsQ.getWaitingCount();
          redisStatus.queues = true;
        } catch {
          redisStatus.queues = false;
        }
      } catch {
        // Redis not connected
      }
    }
    
    return { 
      ok: true, 
      uptime: process.uptime(),
      redis: redisStatus
    };
});

  // GET /v1/demo
  app.get('/v1/demo', {
    schema: {
      description: 'Demo endpoint to verify API is working',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            now: { type: 'string', format: 'date-time' }
      }
    }
    }
    }
  }, async () => ({ ok: true, now: new Date().toISOString() }));

  // GET /billing/success - Public success page after Stripe payment
  app.get('/billing/success', {
    schema: {
      description: 'Success page after Stripe checkout completion',
      tags: ['Billing'],
      hide: true, // Hide from Swagger UI
      querystring: {
        type: 'object',
        properties: {
          session_id: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            session_id: { type: 'string', nullable: true },
            note: { type: 'string', nullable: true }
          }
        }
      }
    }
  }, async (req, reply) => {
    const sessionId = (req.query as { session_id?: string })?.session_id;
    
    // Try to retrieve API key from database if webhook already processed
    let apiKeyInfo = null;
    if (sessionId && stripe) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const email = session.customer_details?.email;
        
        if (email) {
          const { pool } = getDb();
          const result = await pool.query(
            `SELECT ak.key_hash, t.name, t.active 
             FROM tenants t 
             JOIN api_keys ak ON ak.tenant_id = t.id 
             WHERE t.name = $1 
             ORDER BY ak.created_at DESC 
             LIMIT 1`,
            [email]
          );
          
          if (result.rows.length > 0) {
            apiKeyInfo = {
              email,
              tenantActive: result.rows[0].active
            };
          }
        }
      } catch (err) {
        // Ignore errors - webhook might not have processed yet
      }
    }
    
    const emailMessage = apiKeyInfo 
      ? `Your API key has been sent to ${apiKeyInfo.email}. Check your email inbox.`
      : 'Your API key is being generated and will be emailed to you shortly. Please check your email inbox.';
    
    return reply.type('text/html').send(`
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Payment Successful</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            text-align: center;
            padding: 50px;
            background-color: #f7f9fc;
            color: #333;
          }
          .card {
            max-width: 480px;
            margin: 40px auto;
            background: #fff;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          }
          h1 {
            color: #06b67b;
          }
          p {
            font-size: 16px;
            margin-top: 12px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✅ Payment Successful</h1>
          <p>${emailMessage}</p>
          <p>Please check your inbox for confirmation.</p>
          <a href="https://sinna.site" style="color:#06b67b;text-decoration:none;">Back to home</a>
        </div>
      </body>
      </html>
    `);
  });

  // GET /billing/cancel - Public cancel page after Stripe checkout cancellation
  app.get('/billing/cancel', {
    schema: {
      description: 'Cancel page after Stripe checkout cancellation',
      tags: ['Billing'],
      hide: true, // Hide from Swagger UI
      response: {
        200: {
          type: 'string',
          description: 'HTML page'
        }
      }
    }
  }, async (req, reply) => {
    return reply.type('text/html').send(`
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Payment Cancelled</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            text-align: center;
            padding: 50px;
            background-color: #fff8f8;
            color: #333;
          }
          .card {
            max-width: 480px;
            margin: 40px auto;
            background: #fff;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          }
          h1 {
            color: #e63946;
          }
          p {
            font-size: 16px;
            margin-top: 12px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>❌ Payment Cancelled</h1>
          <p>Your payment was cancelled or did not complete successfully.</p>
          <p>If this was a mistake, you can try again.</p>
          <a href="https://sinna.site" style="color:#e63946;text-decoration:none;">Return Home</a>
        </div>
      </body>
      </html>
    `);
  });

  // GET /v1/me/usage
  app.get('/v1/me/usage', {
    schema: {
      description: 'Get current usage statistics for the billing period',
      tags: ['Usage'],
      security: [{ ApiKeyAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                period_start: { type: 'string', format: 'date-time' },
                period_end: { type: 'string', format: 'date-time' },
                requests: { type: 'number' },
                minutes: { type: 'number' },
                jobs: { type: 'number' },
                storage: { type: 'number' },
                cap: { type: 'number' }
    }
  }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (req, res) => {
    const tenantId = (req as AuthenticatedRequest).tenantId;
    if (!tenantId) {
      return res.code(401).send({ success: false, error: 'unauthorized' });
    }
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const state = tenants.get(tenantId) || {
      active: false,
      usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
    } as TenantState;
  res.send({ success: true, data: { period_start: startOfMonth, period_end: endOfMonth, ...state.usage } });
});

  // GET /v1/files/:id:sign
  app.get('/v1/files/:id:sign', {
    schema: {
      description: 'Generate a signed URL for file access',
      tags: ['Files'],
      security: [{ ApiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'File ID or path in R2 storage'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          ttl: {
            type: 'number',
            description: 'URL expiration in seconds (default: 3600, max: 86400)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                expires_in: { type: 'number' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            details: { type: 'array' }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
    }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (req, res) => {
    try {
      const paramsObj: Record<string, unknown> = {
        ...(req.params as Record<string, unknown>),
        ...(req.query as Record<string, unknown>),
      };
      const params = z
        .object({ 
          id: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_\-/]+$/, 'File ID contains invalid characters'), 
          ttl: z.coerce.number().int().positive().max(86400).optional() 
        })
        .parse(paramsObj);

      const ttl = params.ttl ?? 3600;
      const url = await getSignedGetUrl(params.id, ttl);
      return { success: true, data: { url, expires_in: ttl } };
      } catch (error) {
      if (error instanceof z.ZodError) {
        return res.code(400).send({ success: false, error: 'Invalid parameters', details: error.errors });
      }
      req.log.error({ error }, 'Failed to generate signed URL');
      return res.code(500).send({ success: false, error: 'Failed to generate signed URL' });
    }
  });
}

// Jobs routes are now in routes/jobs.ts

// Note: Routes like /v1/me/usage and /v1/files/:id:sign are now registered via registerTopLevelRoutes()
// in start() function after Swagger is initialized, so they appear in Swagger documentation.

// Webhook routes are now in routes/webhooks.ts

// Capture unhandled errors
app.addHook('onError', async (req, _reply, err) => {
  try {
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err, {
        extra: {
          url: req.url,
          method: req.method,
          tenantId: (req as AuthenticatedRequest).tenantId,
          requestId: (req as AuthenticatedRequest).requestId,
        },
      });
    }
  } catch {
    // Ignore Sentry errors
  }
});

// Note: /v1/files/:id:sign route is now registered via registerTopLevelRoutes() in start()

const port = Number(process.env.PORT || 4000);

async function start() {
  try {
    // Register Swagger FIRST before any routes
    // IMPORTANT: Must await to ensure Swagger is fully initialized and hooks are active
    await app.register(fastifySwagger, {
      mode: 'dynamic',
      openapi: {
        info: { 
          title: 'Sinna API', 
          version: '1.0.0',
          description: 'External API for streaming services offering advanced accessibility features.',
          contact: {
            email: 'motion24inc@gmail.com'
          }
        },
        servers: [{ url: process.env.BASE_URL_PUBLIC || (process.env.NODE_ENV === 'production' ? 'https://sinna.site' : 'http://localhost:4000') }],
        tags: [
          { name: 'System', description: 'System health and monitoring endpoints' },
          { name: 'Jobs', description: 'Video processing job management' },
          { name: 'Billing', description: 'Subscription and billing endpoints' },
          { name: 'Subscription', description: 'Subscription management' },
          { name: 'Usage', description: 'Usage statistics and limits' },
          { name: 'Webhooks', description: 'Webhook endpoints (Stripe)' },
          { name: 'Files', description: 'File and artifact management' }
        ],
        components: {
          securitySchemes: {
            ApiKeyAuth: {
              type: 'apiKey' as const,
              name: 'x-api-key',
              in: 'header' as const,
              description: 'API key for authentication. Get your key from your account dashboard.'
            }
          }
        }
      }
    });
    await app.register(fastifySwaggerUi, { 
      routePrefix: '/api-docs',
      uiConfig: { 
        docExpansion: 'list',
        persistAuthorization: true
      }
    });
    
    if (process.env.RUN_MIGRATIONS_ON_BOOT === '1') {
      await runMigrations();
      app.log.info('DB migrations completed');
    }
    
    // Verify BullMQ Redis connection (used by queues)
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const bullMQRedisOk = await verifyRedisConnection();
        if (bullMQRedisOk) {
          app.log.info('✅ BullMQ Redis connection verified (queues will work)');
        } else {
          app.log.warn('⚠️  BullMQ Redis connection failed (queues may not work)');
        }
      } catch (err) {
        app.log.warn({ err }, '⚠️  BullMQ Redis verification failed (queues may not work)');
      }
    } else {
      app.log.warn('⚠️  REDIS_URL not set; BullMQ queues will not work');
    }
    
    // Initialize Redis if configured; fallback to memory limiter on failure
    if (redisUrl) {
      const client = new IORedis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableReadyCheck: false,
        retryStrategy: () => null,
        connectTimeout: 1000,
      });
      try {
        await client.connect();
        redis = client;
        limiter = new RateLimiterRedis({
          storeClient: redis,
          points: pointsPerMinute,
          duration: 60,
          keyPrefix: 'rlf:global',
          execEvenly: true,
          blockDuration: 0,
          insuranceLimiter: new RateLimiterMemory({ points: pointsPerMinute, duration: 60 }),
        });
        webhookLimiter = new RateLimiterRedis({
          storeClient: redis,
          points: 100,
          duration: 60,
          keyPrefix: 'rlf:webhook',
          execEvenly: true,
          blockDuration: 0,
          insuranceLimiter: new RateLimiterMemory({ points: 100, duration: 60 }),
        });
        app.log.info('Redis connected; using distributed rate limiter');
      } catch (e) {
        app.log.warn({ err: e }, 'Redis unavailable; using in-memory rate limiter');
        try { client.disconnect(); } catch {}
        redis = null;
      }
    }
    
    // Register all routes after Swagger is initialized
    // Swagger will capture these routes via onRoute hook
    registerTopLevelRoutes(); // Register routes that were at top level
    registerRoutes(); // Register routes from route modules
    // Register job routes with current redis state
    registerJobRoutes(app, { captions: captionsQ, ad: adQ, color: colorQ, videoTransform: videoTransformQ }, redis, queueDepth, failuresTotal);
    
    // Sanity check: print environment
    app.log.info({ env: process.env.NODE_ENV }, 'Environment');
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



