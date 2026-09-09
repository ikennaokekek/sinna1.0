import { beforeEach, describe, expect, it, vi } from 'vitest';

const { withConnection, withTransaction } = vi.hoisted(() => ({
  withConnection: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  getDb: vi.fn(),
  withConnection,
  withTransaction,
}));
vi.mock('../lib/email', () => ({
  sendEmailNotice: vi.fn(),
}));

import {
  applyStripeLifecycleMutation,
  invoicePeriodEnd,
  retrieveStripeEventForRecovery,
  stripeGraceUntil,
  waitForStripeWebhookTransactionSettlement,
  withBoundedStripeWebhookTransaction,
} from './webhooks';

describe('Stripe lifecycle event ordering', () => {
  const query = vi.fn();
  const quarantine = vi.fn();
  const lease = {
    quarantine,
    isQuarantined: vi.fn(() => quarantine.mock.calls.length > 0),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    withTransaction.mockImplementation(async (work) => work({ query }));
    withConnection.mockImplementation(async (work) => work({ query }, lease));
  });

  it('acknowledges an out-of-order payment after deletion without regressing state', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'tenant-1',
        stripe_event_created: '200',
        stripe_event_id: 'evt_deletion',
        status: 'expired',
        active: false,
      }],
    });

    await expect(applyStripeLifecycleMutation(
      { id: 'evt_payment', created: 100 },
      {
        status: 'active',
        active: true,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        graceUntil: null,
      },
    )).resolves.toEqual({ tenantId: 'tenant-1', applied: false });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE tenants'))).toBe(false);
  });

  it('applies a more restrictive cancellation at the same timestamp regardless of event ID', async () => {
    query
      .mockResolvedValueOnce({
      rows: [{
        id: 'tenant-1',
        stripe_event_created: '200',
        stripe_event_id: 'evt_z',
        status: 'active',
        active: true,
      }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(applyStripeLifecycleMutation(
      { id: 'evt_a', created: 200 },
      {
        status: 'inactive',
        active: false,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: null,
        expiresAt: null,
        graceUntil: null,
      },
    )).resolves.toEqual({ tenantId: 'tenant-1', applied: true });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE tenants'))).toBe(true);
  });

  it('does not reactivate a restrictive state from an equal-second success', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'tenant-1',
        stripe_event_created: '200',
        stripe_event_id: 'evt_a',
        status: 'expired',
        active: false,
      }],
    });
    await expect(applyStripeLifecycleMutation(
      { id: 'evt_z', created: 200 },
      {
        status: 'active',
        active: true,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        expiresAt: null,
        graceUntil: null,
      },
    )).resolves.toEqual({ tenantId: 'tenant-1', applied: false });
    expect(query).toHaveBeenCalledOnce();
  });

  it('converges equal-second past-due events to no grace when grace arrives second', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'tenant-1',
        stripe_event_created: '200',
        stripe_event_id: 'evt_update',
        status: 'inactive',
        active: false,
        grace_until: null,
      }],
    });
    await expect(applyStripeLifecycleMutation(
      { id: 'evt_invoice', created: 200 },
      {
        status: 'inactive',
        active: false,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        expiresAt: null,
        graceUntil: new Date('2030-01-01T00:00:00.000Z'),
      },
    )).resolves.toEqual({ tenantId: 'tenant-1', applied: false });
    expect(query).toHaveBeenCalledOnce();
  });

  it('removes equal-second grace when the no-grace event arrives second', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: 'tenant-1',
          stripe_event_created: '200',
          stripe_event_id: 'evt_invoice',
          status: 'inactive',
          active: false,
          grace_until: new Date('2030-01-01T00:00:00.000Z'),
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(applyStripeLifecycleMutation(
      { id: 'evt_update', created: 200 },
      {
        status: 'inactive',
        active: false,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        expiresAt: null,
        graceUntil: null,
      },
    )).resolves.toEqual({ tenantId: 'tenant-1', applied: true });
  });

  it('fails closed when customer and subscription identifiers resolve to different tenants', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'tenant-by-subscription',
          stripe_customer_id: 'cus_other',
          stripe_subscription_id: 'sub_1',
          stripe_event_created: null,
          stripe_event_id: null,
        },
        {
          id: 'tenant-by-customer',
          stripe_customer_id: 'cus_1',
          stripe_subscription_id: 'sub_other',
          stripe_event_created: null,
          stripe_event_id: null,
        },
      ],
    });
    await expect(applyStripeLifecycleMutation(
      { id: 'evt_conflict', created: 300 },
      {
        status: 'active',
        active: true,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        expiresAt: null,
        graceUntil: null,
      },
    )).rejects.toThrow(/Conflicting Stripe customer and subscription/);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE tenants'))).toBe(false);
  });

  it('uses event ID to apply the deterministic equal-rank winner and all projection fields', async () => {
    const expiresAt = new Date('2040-01-01T00:00:00.000Z');
    query
      .mockResolvedValueOnce({
        rows: [{
          id: 'tenant-1',
          stripe_customer_id: 'cus_1',
          stripe_subscription_id: null,
          stripe_event_created: '200',
          stripe_event_id: 'evt_a',
          status: 'active',
          active: true,
          grace_until: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(applyStripeLifecycleMutation(
      { id: 'evt_z', created: 200 },
      {
        status: 'active',
        active: true,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_winner',
        expiresAt,
        graceUntil: null,
      },
    )).resolves.toEqual({ tenantId: 'tenant-1', applied: true });
    expect(query.mock.calls[1][1]).toEqual([
      'active',
      true,
      expiresAt,
      null,
      'sub_winner',
      200,
      'evt_z',
      'tenant-1',
    ]);
  });

  it('rejects the lower event ID at the same second and restriction rank', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'tenant-1',
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_winner',
        stripe_event_created: '200',
        stripe_event_id: 'evt_z',
        status: 'active',
        active: true,
        grace_until: null,
      }],
    });
    await expect(applyStripeLifecycleMutation(
      { id: 'evt_a', created: 200 },
      {
        status: 'active',
        active: true,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_winner',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        graceUntil: null,
      },
    )).resolves.toEqual({ tenantId: 'tenant-1', applied: false });
    expect(query).toHaveBeenCalledOnce();
  });
});

describe('Stripe invoice authority', () => {
  it('uses the authoritative invoice line period end', () => {
    const invoice = {
      lines: {
        data: [
          { period: { start: 1_700_000_000, end: 1_702_592_000 } },
        ],
      },
    };
    expect(invoicePeriodEnd(invoice as never)).toEqual(new Date(1_702_592_000_000));
  });

  it('fails closed when Stripe omits invoice line period data', () => {
    expect(() => invoicePeriodEnd({ lines: { data: [] } } as never))
      .toThrow(/authoritative invoice line period end/);
  });

  it('derives grace from immutable event creation time rather than delivery time', () => {
    expect(stripeGraceUntil(1_700_000_000, 7))
      .toEqual(new Date(1_700_604_800_000));
  });
});

describe('Stripe autonomous recovery retrieval', () => {
  it('bounds a stalled Stripe Events API retrieval and disables network retries', async () => {
    const retrieve = vi.fn(() => new Promise(() => undefined));
    await expect(retrieveStripeEventForRecovery(
      { events: { retrieve } } as never,
      'evt_stalled_recovery',
      5,
    )).rejects.toThrow('Stripe webhook recovery retrieval deadline exceeded');
    expect(retrieve).toHaveBeenCalledWith('evt_stalled_recovery', {
      timeout: 5,
      maxNetworkRetries: 0,
    });
  });
});

describe('Stripe webhook transaction settlement', () => {
  const quarantined = vi.fn();
  const lease = {
    quarantine: quarantined,
    isQuarantined: vi.fn(() => quarantined.mock.calls.length > 0),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    withConnection.mockImplementation(async (work) => work({ query: vi.fn() }, lease));
  });

  it('does not claim a stalled transaction settled before failure recording', async () => {
    const stalled = new Promise<void>(() => undefined);
    await expect(waitForStripeWebhookTransactionSettlement(stalled, () => false, 10))
      .resolves.toBe(false);
  });

  it('recognizes rollback rejection as settled before failure recording', async () => {
    let settled = false;
    const rolledBack = Promise.reject(new Error('rolled back')).finally(() => {
      settled = true;
    });
    await expect(waitForStripeWebhookTransactionSettlement(rolledBack, () => settled, 50))
      .resolves.toBe(true);
  });

  it('bounds a stalled transaction BEGIN before setup can leak the request', async () => {
    vi.useFakeTimers();
    let resolveBegin: (() => void) | undefined;
    const stalledQuery = vi.fn(() => new Promise((resolve) => {
      resolveBegin = () => resolve({ rows: [] });
    }));
    withConnection.mockImplementationOnce(async (work) => work({ query: stalledQuery }, lease));
    const operation = withBoundedStripeWebhookTransaction(async () => undefined);
    const rejection = expect(operation).rejects.toThrow(/BEGIN deadline exceeded/);
    await vi.advanceTimersByTimeAsync(6_601);
    await rejection;
    expect(stalledQuery).toHaveBeenCalledWith(expect.objectContaining({
      text: 'BEGIN',
      query_timeout: expect.any(Number),
    }));
    expect(quarantined).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/BEGIN deadline exceeded/),
    }));
    resolveBegin?.();
    await vi.runAllTicks();
    expect(stalledQuery).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('quarantines an ambiguous COMMIT and does not queue ROLLBACK behind it', async () => {
    vi.useFakeTimers();
    let resolveCommit: (() => void) | undefined;
    const query = vi.fn(({ text }: { text: string }) => (
      text === 'COMMIT'
        ? new Promise((resolve) => {
          resolveCommit = () => resolve({ rows: [] });
        })
        : Promise.resolve({ rows: [] })
    ));
    withConnection.mockImplementationOnce(async (work) => work({ query }, lease));
    const operation = withBoundedStripeWebhookTransaction(async () => 'done');
    const rejection = expect(operation).rejects.toThrow(/COMMIT deadline exceeded/);
    await vi.advanceTimersByTimeAsync(6_601);
    await rejection;
    expect(quarantined).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/COMMIT deadline exceeded/),
    }));
    resolveCommit?.();
    await vi.runAllTicks();
    expect(query.mock.calls.map(([request]) => request.text)).not.toContain('ROLLBACK');
    vi.useRealTimers();
  });

  it('quarantines when ROLLBACK cannot settle', async () => {
    vi.useFakeTimers();
    const query = vi.fn(({ text }: { text: string }) => (
      text === 'ROLLBACK' ? new Promise(() => undefined) : Promise.resolve({ rows: [] })
    ));
    withConnection.mockImplementationOnce(async (work) => work({ query }, lease));
    const operation = withBoundedStripeWebhookTransaction(async () => {
      throw new Error('business failure');
    });
    const rejection = expect(operation).rejects.toThrow('business failure');
    await vi.advanceTimersByTimeAsync(1_101);
    await rejection;
    expect(quarantined).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/ROLLBACK deadline exceeded/),
    }));
    vi.useRealTimers();
  });

  it('quarantines a pg driver query timeout before attempting rollback', async () => {
    const query = vi.fn(({ text }: { text: string }) => (
      text === 'SELECT tenant'
        ? Promise.reject(new Error('Query read timeout'))
        : Promise.resolve({ rows: [] })
    ));
    withConnection.mockImplementationOnce(async (work) => work({ query }, lease));
    await expect(withBoundedStripeWebhookTransaction(async (client) => {
      await client.query('SELECT tenant');
    })).rejects.toThrow(/Query read timeout/);
    expect(quarantined).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Query read timeout',
    }));
    expect(query.mock.calls.map(([request]) => request.text)).not.toContain('ROLLBACK');
  });

  it('quarantines an immediately rejected ROLLBACK', async () => {
    const query = vi.fn(({ text }: { text: string }) => (
      text === 'ROLLBACK'
        ? Promise.reject(new Error('rollback transport failure'))
        : Promise.resolve({ rows: [] })
    ));
    withConnection.mockImplementationOnce(async (work) => work({ query }, lease));
    await expect(withBoundedStripeWebhookTransaction(async () => {
      throw new Error('business failure');
    })).rejects.toThrow('business failure');
    expect(quarantined).toHaveBeenCalledWith(expect.objectContaining({
      message: 'rollback transport failure',
    }));
  });

  it('rolls back an ordinary failure without quarantining a settled connection', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    withConnection.mockImplementationOnce(async (work) => work({ query }, lease));
    await expect(withBoundedStripeWebhookTransaction(async () => {
      throw new Error('business failure');
    })).rejects.toThrow('business failure');
    expect(query.mock.calls.map(([request]) => request.text)).toContain('ROLLBACK');
    expect(quarantined).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});