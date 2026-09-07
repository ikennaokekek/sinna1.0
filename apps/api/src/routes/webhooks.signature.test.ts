import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import Stripe from 'stripe';
import { registerWebhookRoutes } from './webhooks';
import type { TenantState } from '../types';

const { getDb, dbQuery, createApiKey, sendApiKeyEmail, sendEmailNotice } = vi.hoisted(() => ({
  getDb: vi.fn(),
  dbQuery: vi.fn(),
  createApiKey: vi.fn(),
  sendApiKeyEmail: vi.fn(),
  sendEmailNotice: vi.fn(),
}));
vi.mock('../lib/db', () => ({ getDb, withRetry: vi.fn() }));
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
  const prevStripeTesting = process.env.STRIPE_TESTING;

  beforeAll(async () => {
    getDb.mockReturnValue({
      pool: {
        query: dbQuery.mockImplementation(async (sql: string, params: string[]) => (
          sql.includes('INSERT INTO stripe_webhook_events')
            ? { rows: [{ claim_token: params[1] }] }
            : { rows: [] }
        )),
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
  });

  it('never provisions, rotates, or emails a key even when the legacy flag is set', async () => {
    const previous = process.env.ENABLE_RENDER_CHECKOUT_HANDLER;
    process.env.ENABLE_RENDER_CHECKOUT_HANDLER = 'true';
    dbQuery.mockClear();
    createApiKey.mockClear();
    sendApiKeyEmail.mockClear();
    const payload = JSON.stringify(checkoutCompletedEvent('evt_checkout_legacy_flag'));
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
    expect(dbQuery.mock.calls.every(([sql]) => String(sql).includes('stripe_webhook_events'))).toBe(true);
    expect(dbQuery.mock.calls.some(([sql]) => String(sql).includes("status = 'completed'"))).toBe(true);

    if (previous === undefined) delete process.env.ENABLE_RENDER_CHECKOUT_HANDLER;
    else process.env.ENABLE_RENDER_CHECKOUT_HANDLER = previous;
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
});
