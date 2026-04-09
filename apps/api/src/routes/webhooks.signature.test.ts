import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import Stripe from 'stripe';
import { registerWebhookRoutes } from './webhooks';
import type { TenantState } from '../types';

/**
 * Exercises the production webhook path: stripe.webhooks.constructEvent + raw body.
 * checkout.session.completed is used so ENABLE_RENDER_CHECKOUT_HANDLER stays off and no DB work runs.
 */
describe('Stripe webhook signature verification', () => {
  const webhookSecret = 'whsec_test_signature_integration_only';
  const tenants = new Map<string, TenantState>();

  let stripe: Stripe;
  let app: FastifyInstance;

  const prevNodeEnv = process.env.NODE_ENV;
  const prevWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const prevStripeTesting = process.env.STRIPE_TESTING;
  const prevEnableRenderCheckout = process.env.ENABLE_RENDER_CHECKOUT_HANDLER;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.STRIPE_TESTING;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    delete process.env.ENABLE_RENDER_CHECKOUT_HANDLER;

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
    if (prevEnableRenderCheckout === undefined) {
      delete process.env.ENABLE_RENDER_CHECKOUT_HANDLER;
    } else {
      process.env.ENABLE_RENDER_CHECKOUT_HANDLER = prevEnableRenderCheckout;
    }
  });

  function checkoutCompletedEvent(): Stripe.Event {
    return {
      id: 'evt_test_sig',
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
});
