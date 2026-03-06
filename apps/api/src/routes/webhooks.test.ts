import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { handleCheckoutSessionCompleted } from './webhooks';

const logContext = { requestId: 'test' };

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// Mock DB so insertOnboardingLog and markEventProcessed don't throw
vi.mock('../lib/db', () => ({
  getDb: () => ({
    pool: {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    },
  }),
}));

describe('Stripe Webhook - checkout.session.completed (internal onboard)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.ONBOARD_SERVICE_URL;
    delete process.env.INTERNAL_SERVICE_SECRET;
  });

  it('calls onboarding service POST /internal/onboard when session is paid and complete', async () => {
    process.env.ONBOARD_SERVICE_URL = 'https://sinna-onboarding-service.replit.app';
    process.env.INTERNAL_SERVICE_SECRET = 'internal_secret';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const event: Stripe.Event = {
      id: 'evt_test',
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
          payment_status: 'paid',
          status: 'complete',
          customer_email: 'test@example.com',
          customer: 'cus_123',
          subscription: 'sub_456',
        } as Stripe.Checkout.Session,
      },
    };

    const log = createLogger();
    const req = { log } as any;

    await handleCheckoutSessionCompleted(event, req, logContext);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sinna-onboarding-service.replit.app/internal/onboard');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-Internal-Timestamp']).toBeDefined();
    expect(init.headers['X-Internal-Signature']).toBeDefined();

    const body = JSON.parse(init.body);
    expect(body.eventId).toBe('evt_test');
    expect(body.stripeSessionId).toBe('cs_test');
    expect(body.stripeCustomerId).toBe('cus_123');
    expect(body.subscriptionId).toBe('sub_456');
    expect(body.email).toBe('test@example.com');
    expect(body.plan).toBe('standard');
    expect(body.timestamp).toBeDefined();
  });

  it('does not call onboarding service when session is not paid', async () => {
    process.env.ONBOARD_SERVICE_URL = 'https://sinna-onboarding-service.replit.app';
    process.env.INTERNAL_SERVICE_SECRET = 'internal_secret';

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock as any);

    const event: Stripe.Event = {
      id: 'evt_test',
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
          payment_status: 'unpaid',
          status: 'complete',
          customer_email: 'test@example.com',
        } as Stripe.Checkout.Session,
      },
    };

    const log = createLogger();
    const req = { log } as any;

    await handleCheckoutSessionCompleted(event, req, logContext);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
