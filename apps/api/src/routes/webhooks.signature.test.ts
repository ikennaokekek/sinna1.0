import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import Stripe from 'stripe';
import { registerWebhookRoutes } from './webhooks';
import type { TenantState } from '../types';
import { performanceMonitor } from '../lib/logger';
import { createHash } from 'crypto';
import { Writable } from 'stream';

const { getDb, dbQuery, withConnection, withTransaction, createApiKey, sendApiKeyEmail, sendEmailNotice } = vi.hoisted(() => ({
  withConnection: vi.fn(),
  getDb: vi.fn(),
  dbQuery: vi.fn(),
  withTransaction: vi.fn(),
  createApiKey: vi.fn(),
  sendApiKeyEmail: vi.fn(),
  sendEmailNotice: vi.fn(),
}));
vi.mock('../lib/db', () => ({ getDb, withRetry: vi.fn(), withConnection, withTransaction }));
vi.mock('../utils/keys', () => ({ createApiKey }));
vi.mock('../utils/email', () => ({ sendApiKeyEmail, sendEmailNotice }));

/**
 * Exercises the production webhook path: stripe.webhooks.constructEvent + raw body.
 * checkout.session.completed is authenticated and durably acknowledged, but
 * Core never performs onboarding/key provisioning for it.
 */
describe('Stripe webhook signature verification', () => {
  const webhookSecret = 'whsec_test_signature_integration_only';
  const tenants = new Map<string, TenantState>();

  let stripe: Stripe;
  let app: FastifyInstance;

  const prevNodeEnv = process.env.NODE_ENV;
  const prevWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const prevLiveWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET_LIVE;
  const prevStripeTesting = process.env.STRIPE_TESTING;

  beforeAll(async () => {
    withTransaction.mockImplementation(async (work) => work({ query: dbQuery }));
    withConnection.mockImplementation(async (work) => work({ query: dbQuery }));
    getDb.mockReturnValue({
      pool: {
        query: dbQuery.mockImplementation(async (input: string | { text: string; values: string[] }, params: string[] = []) => {
          const sql = typeof input === 'string' ? input : input.text;
          const values = typeof input === 'string' ? params : input.values;
          if (sql.includes('INSERT INTO stripe_webhook_events')) {
            return { rows: [{ claim_token: values[5], attempts: 1 }] };
          }
          if (sql.includes('UPDATE stripe_webhook_events')) return { rows: [], rowCount: 1 };
          return { rows: [] };
        }),
      },
    });
    process.env.NODE_ENV = 'test';
    delete process.env.STRIPE_TESTING;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    stripe = new Stripe('sk_test_' + 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx', {
      apiVersion: '2023-10-16',
    });

    const f = Fastify({ logger: false });
    await f.register(fastifyRawBody, {
      field: 'rawBody',
      global: false,
      encoding: false,
      runFirst: true,
    });
    registerWebhookRoutes(f, stripe, tenants);
    await f.ready();
    app = f;
  });

  afterAll(async () => {
    await app.close();
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = prevWebhookSecret;
    if (prevLiveWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET_LIVE;
    else process.env.STRIPE_WEBHOOK_SECRET_LIVE = prevLiveWebhookSecret;
    if (prevStripeTesting === undefined) delete process.env.STRIPE_TESTING;
    else process.env.STRIPE_TESTING = prevStripeTesting;
  });

  function checkoutCompletedEvent(id = 'evt_test_sig'): Stripe.Event {
    return {
      id,
      object: 'event',
      api_version: '2023-10-16',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test',
          object: 'checkout.session',
        } as Stripe.Checkout.Session,
      },
    };
  }

  function subscriptionUpdatedEvent(id: string): Stripe.Event {
    return {
      ...checkoutCompletedEvent(id),
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_missing',
          object: 'subscription',
          customer: 'cus_missing',
          status: 'active',
          current_period_end: 1_800_000_000,
        } as Stripe.Subscription,
      },
    };
  }

  it('returns 200 for checkout.session.completed with valid Stripe-Signature', async () => {
    const payload = JSON.stringify(checkoutCompletedEvent());
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ received: true });
    const insert = dbQuery.mock.calls.find(([input]) => {
      const sql = typeof input === 'string' ? input : input.text;
      return sql.includes('INSERT INTO stripe_webhook_events');
    });
    expect(insert?.[0].values[4]).toBe(createHash('sha256').update(Buffer.from(payload)).digest('hex'));
    for (const statement of ['BEGIN', 'SET LOCAL lock_timeout', 'COMMIT']) {
      const call = dbQuery.mock.calls.find(([input]) => {
        const sql = typeof input === 'string' ? input : input.text;
        return sql.includes(statement);
      });
      expect(call?.[0]).toEqual(expect.objectContaining({ query_timeout: expect.any(Number) }));
    }
  });

  it('cleans up webhook performance monitoring on success and early rejection', async () => {
    const before = performanceMonitor.getMetrics().length;
    const payload = JSON.stringify(checkoutCompletedEvent('evt_perf_cleanup'));
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    expect((await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
      payload,
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload,
    })).statusCode).toBe(400);
    expect(performanceMonitor.getMetrics()).toHaveLength(before);
  });

  it('never provisions, rotates, or emails a key for checkout completion', async () => {
    dbQuery.mockClear();
    createApiKey.mockClear();
    sendApiKeyEmail.mockClear();
    const payload = JSON.stringify(checkoutCompletedEvent('evt_checkout_no_provisioning'));
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(createApiKey).not.toHaveBeenCalled();
    expect(sendApiKeyEmail).not.toHaveBeenCalled();
    expect(dbQuery.mock.calls.some(([input]) => {
      const sql = typeof input === 'string' ? input : input.text;
      return /(?:INSERT INTO api_keys|UPDATE tenants)/i.test(String(sql));
    }))
      .toBe(false);
    expect(dbQuery.mock.calls.some(([input]) => {
      const sql = typeof input === 'string' ? input : input.text;
      return String(sql).includes('outcome = $4');
    })).toBe(true);

  });

  it('returns 400 when Stripe-Signature was signed with a different secret', async () => {
    const payload = JSON.stringify(checkoutCompletedEvent());
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_different_secret_used_only_here',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { success?: boolean; error?: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid signature');
  });

  it('never serializes invalid-signature payload, header, or sentinel PII into logs', async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const loggedApp = Fastify({
      logger: {
        level: 'warn',
        stream: sink,
      },
    });
    await loggedApp.register(fastifyRawBody, {
      field: 'rawBody',
      global: false,
      encoding: false,
      runFirst: true,
    });
    registerWebhookRoutes(loggedApp, stripe, new Map<string, TenantState>());
    await loggedApp.ready();
    const sentinelEmail = 'stripe-log-sentinel@example.invalid';
    const sentinelCard = '4242424242424242';
    const sentinelHeader = 't=1,v1=stripe_log_signature_sentinel';
    const response = await loggedApp.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: {
        'stripe-signature': sentinelHeader,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        email: sentinelEmail,
        card: sentinelCard,
      }),
    });
    await loggedApp.close();
    const serializedLogs = lines.join('');
    expect(response.statusCode).toBe(400);
    expect(serializedLogs).toContain('stripe_webhook_signature');
    expect(serializedLogs).toContain('verification_failed');
    expect(serializedLogs).not.toContain(sentinelEmail);
    expect(serializedLogs).not.toContain(sentinelCard);
    expect(serializedLogs).not.toContain(sentinelHeader);
  });

  it('rejects a missing Stripe-Signature before processing the body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(checkoutCompletedEvent()),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('missing_signature');
  });

  it('rejects malformed Stripe-Signature values', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: {
        'stripe-signature': 'not-a-stripe-signature',
        'content-type': 'application/json',
      },
      payload: JSON.stringify(checkoutCompletedEvent()),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Invalid signature');
  });

  it('rejects requests when the raw signed body is unavailable', async () => {
    const noRawBodyApp = Fastify({ logger: false });
    registerWebhookRoutes(noRawBodyApp, stripe, new Map<string, TenantState>());
    await noRawBodyApp.ready();
    const payload = JSON.stringify(checkoutCompletedEvent());
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    const res = await noRawBodyApp.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: {
        'stripe-signature': signature,
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('missing_body');
    await noRawBodyApp.close();
  });

  it('does not enable the signature bypass in production when STRIPE_TESTING is set', async () => {
    const previousEnv = process.env.NODE_ENV;
    const previousTesting = process.env.STRIPE_TESTING;
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';
    process.env.STRIPE_TESTING = 'true';
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const productionApp = Fastify({ logger: false });
    await productionApp.register(fastifyRawBody, {
      field: 'rawBody',
      global: false,
      encoding: false,
      runFirst: true,
    });
    registerWebhookRoutes(productionApp, null, new Map<string, TenantState>());
    await productionApp.ready();

    const res = await productionApp.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(checkoutCompletedEvent()),
    });

    expect(res.statusCode).toBe(503);
    await productionApp.close();
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    if (previousTesting === undefined) delete process.env.STRIPE_TESTING;
    else process.env.STRIPE_TESTING = previousTesting;
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  });

  it('rejects generic-secret fallback and test-mode events in production', async () => {
    const previousEnv = process.env.NODE_ENV;
    const previousGeneric = process.env.STRIPE_WEBHOOK_SECRET;
    const previousLive = process.env.STRIPE_WEBHOOK_SECRET_LIVE;
    process.env.NODE_ENV = 'production';
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    delete process.env.STRIPE_WEBHOOK_SECRET_LIVE;

    const productionApp = Fastify({ logger: false });
    await productionApp.register(fastifyRawBody, {
      field: 'rawBody', global: false, encoding: false, runFirst: true,
    });
    registerWebhookRoutes(productionApp, stripe, new Map<string, TenantState>());
    await productionApp.ready();
    const payload = JSON.stringify(checkoutCompletedEvent('evt_generic_rejected'));
    const genericSignature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    expect((await productionApp.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'stripe-signature': genericSignature, 'content-type': 'application/json' },
      payload,
    })).statusCode).toBe(503);

    process.env.STRIPE_WEBHOOK_SECRET_LIVE = 'whsec_live_test_only';
    const testModeSignature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET_LIVE,
    });
    const modeMismatch = await productionApp.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'stripe-signature': testModeSignature, 'content-type': 'application/json' },
      payload,
    });
    expect(modeMismatch.statusCode).toBe(400);
    expect(JSON.parse(modeMismatch.body).error).toBe('stripe_mode_mismatch');
    await productionApp.close();
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    if (previousGeneric === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousGeneric;
    if (previousLive === undefined) delete process.env.STRIPE_WEBHOOK_SECRET_LIVE;
    else process.env.STRIPE_WEBHOOK_SECRET_LIVE = previousLive;
  });

  it('returns retryable 503 until a failed event reaches its durable retry time', async () => {
    const retryAt = new Date(Date.now() + 30_000);
    const payload = JSON.stringify(checkoutCompletedEvent('evt_retry_deferred'));
    const signedEvent = JSON.parse(payload);
    dbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          status: 'failed',
          attempts: 1,
          next_attempt_at: retryAt,
          payload_sha256: createHash('sha256').update(payload).digest('hex'),
          event_type: signedEvent.type,
          event_created: String(signedEvent.created),
          livemode: signedEvent.livemode,
        }],
      });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(503);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(JSON.parse(res.body).error).toBe('stripe_webhook_retry_deferred');
  });

  it('returns a retryable failure and retains evidence when tenant projection is unavailable', async () => {
    dbQuery.mockImplementation(async (input: string | { text: string; values: string[] }, params: string[] = []) => {
      const sql = typeof input === 'string' ? input : input.text;
      const values = typeof input === 'string' ? params : input.values;
      if (sql.includes('INSERT INTO stripe_webhook_events')) {
        return { rows: [{ claim_token: values[5], attempts: 1 }] };
      }
      if (sql.includes('SELECT id, stripe_event_created')) return { rows: [] };
      if (sql.includes("SET status = CASE WHEN attempts")) return { rows: [{ status: 'failed' }] };
      return { rows: [], rowCount: sql.includes('UPDATE stripe_webhook_events') ? 1 : 0 };
    });
    const payload = JSON.stringify(subscriptionUpdatedEvent('evt_retryable_mapping'));
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(500);
    expect(dbQuery.mock.calls.some(([input]) => {
      const sql = typeof input === 'string' ? input : input.text;
      return String(sql).includes('DELETE FROM stripe_webhook_events');
    }))
      .toBe(false);
  });

  it('acknowledges a terminal dead-letter event after retaining exhausted failure evidence', async () => {
    dbQuery.mockImplementation(async (input: string | { text: string; values: string[] }, params: string[] = []) => {
      const sql = typeof input === 'string' ? input : input.text;
      const values = typeof input === 'string' ? params : input.values;
      if (sql.includes('INSERT INTO stripe_webhook_events')) {
        return { rows: [{ claim_token: values[5], attempts: 5 }] };
      }
      if (sql.includes('SELECT id, stripe_event_created')) return { rows: [] };
      if (sql.includes("SET status = CASE WHEN attempts")) {
        return { rows: [{ status: 'dead_letter' }] };
      }
      return { rows: [], rowCount: 0 };
    });
    const payload = JSON.stringify(subscriptionUpdatedEvent('evt_dead_letter_mapping'));
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(dbQuery.mock.calls.some(([input]) => {
      const sql = typeof input === 'string' ? input : input.text;
      return String(sql).includes("'dead_letter'");
    })).toBe(true);
  });
});
