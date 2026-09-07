import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('../lib/db', () => ({ getDb, withRetry: vi.fn() }));

import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
  releaseStripeWebhookEvent,
} from './webhooks';

describe('durable Stripe webhook event claims', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getDb.mockReturnValue({ pool: { query } });
  });

  it('rejects a concurrently claimed or completed duplicate event', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(claimStripeWebhookEvent('evt_duplicate')).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (event_id) DO UPDATE'),
      ['evt_duplicate', expect.any(String), '15 minutes'],
    );
  });

  it('marks successful work completed and releases ordinary handler failures', async () => {
    query.mockResolvedValue({});
    await completeStripeWebhookEvent('evt_complete', 'claim-1');
    await releaseStripeWebhookEvent('evt_failed', 'claim-2');
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("SET status = 'completed'"),
      ['evt_complete', 'claim-1'],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM stripe_webhook_events'),
      ['evt_failed', 'claim-2'],
    );
  });
});