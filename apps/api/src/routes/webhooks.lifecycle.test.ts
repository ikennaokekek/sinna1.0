import { beforeEach, describe, expect, it, vi } from 'vitest';

const { withTransaction } = vi.hoisted(() => ({
  withTransaction: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  getDb: vi.fn(),
  withTransaction,
}));
vi.mock('../lib/email', () => ({
  sendEmailNotice: vi.fn(),
}));

import { applyStripeLifecycleMutation, invoicePeriodEnd } from './webhooks';

describe('Stripe lifecycle event ordering', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    withTransaction.mockImplementation(async (work) => work({ query }));
  });

  it('acknowledges an out-of-order payment after deletion without regressing state', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'tenant-1',
        stripe_event_created: '200',
        stripe_event_id: 'evt_deletion',
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

  it('uses event ID as the deterministic tie-break for equal timestamps', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'tenant-1',
        stripe_event_created: '200',
        stripe_event_id: 'evt_z',
      }],
    });

    await expect(applyStripeLifecycleMutation(
      { id: 'evt_a', created: 200 },
      {
        status: 'inactive',
        active: false,
        stripeCustomerId: 'cus_1',
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
});