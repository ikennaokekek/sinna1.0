import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('./db', () => ({ getDb }));

import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
  failStripeWebhookEvent,
  stripeRawPayloadSha256,
  STRIPE_WEBHOOK_MAX_ATTEMPTS,
} from './stripeWebhookInbox';

function event(id = 'evt_1'): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2023-10-16',
    created: 1_700_000_000,
    livemode: true,
    pending_webhooks: 0,
    request: null,
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', object: 'subscription' } as Stripe.Subscription },
  };
}

function recordedIdentity(
  source: Stripe.Event,
  payloadSha256: string,
  extra: Record<string, unknown> = {},
) {
  return {
    status: 'completed',
    attempts: 2,
    payload_sha256: payloadSha256,
    event_type: source.type,
    event_created: String(source.created),
    livemode: source.livemode,
    ...extra,
  };
}

describe('durable Stripe webhook inbox', () => {
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getDb.mockReturnValue({ pool: { query } });
  });

  it('records signed event metadata and returns the durable attempt', async () => {
    query.mockImplementationOnce(async (config) => ({
      rows: [{ claim_token: config.values[5], attempts: 1 }],
    }));
    const raw = Buffer.from('{ \"id\": \"evt_1\", \"signed\": true }\\n');
    await expect(claimStripeWebhookEvent(event(), stripeRawPayloadSha256(raw))).resolves.toMatchObject({
      kind: 'claimed',
      attempt: 1,
    });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('payload_sha256, status, claim_token'),
      query_timeout: 2_500,
      values: expect.arrayContaining([
          'evt_1',
          'customer.subscription.updated',
          1_700_000_000,
          true,
          expect.stringMatching(/^[0-9a-f]{64}$/),
          expect.any(String),
          '15 minutes',
          STRIPE_WEBHOOK_MAX_ATTEMPTS,
        ]),
    }));
  });

  it('hashes the exact signed raw bytes rather than a reserialized event', () => {
    const raw = Buffer.from(' {\n  \"id\": \"evt_1\", \"type\": \"customer.subscription.updated\"\n}\n');
    expect(stripeRawPayloadSha256(raw)).toBe(
      'adb2af3839ab616c92e042284da229d83a11c70d732739f3768bcba8bd3f0bb1',
    );
    expect(stripeRawPayloadSha256(raw)).not.toBe(
      stripeRawPayloadSha256(Buffer.from(JSON.stringify(JSON.parse(raw.toString())))),
    );
  });

  it('does not reclaim completed, terminal, or concurrently processing duplicates', async () => {
    const duplicate = event('evt_duplicate');
    const digest = 'a'.repeat(64);
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [recordedIdentity(duplicate, digest)] });
    await expect(claimStripeWebhookEvent(duplicate, digest)).resolves.toEqual({
      kind: 'duplicate',
      status: 'completed',
      attempts: 2,
    });
  });

  it('dead-letters an abandoned exhausted lease instead of leaving it processing forever', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'dead_letter', attempts: 5 }] });
    await expect(claimStripeWebhookEvent(event('evt_abandoned'), 'b'.repeat(64))).resolves.toEqual({
      kind: 'duplicate',
      status: 'dead_letter',
      attempts: 5,
    });
    expect(query.mock.calls[1][0].text).toContain('lease_retry_exhausted');
    expect(query.mock.calls[1][0].text).toContain('payload_sha256 = $4');
  });

  it('completes against the active claim with an auditable outcome', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await completeStripeWebhookEvent(
      { query },
      'evt_complete',
      'claim-1',
      'applied',
      'tenant-1',
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('outcome = $4'),
      ['evt_complete', 'claim-1', 'completed', 'applied', 'tenant-1'],
    );
  });

  it('retains retryable failure evidence instead of deleting the event', async () => {
    query.mockResolvedValueOnce({ rows: [{ status: 'failed' }] });
    await expect(failStripeWebhookEvent('evt_failed', 'claim-2', new Error('db unavailable')))
      .resolves.toBe('failed');
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("'dead_letter'"),
      values: ['evt_failed', 'claim-2', STRIPE_WEBHOOK_MAX_ATTEMPTS, 'db unavailable'],
    }));
    expect(String(query.mock.calls[0][0].text)).not.toContain('DELETE FROM');
    expect(String(query.mock.calls[0][0].text)).toContain("interval '5 seconds'");
  });

  it('does not reclaim a failed event until its durable retry time', async () => {
    const deferred = event('evt_backoff');
    const digest = 'c'.repeat(64);
    const retryAt = new Date('2026-09-09T00:00:05Z');
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [recordedIdentity(deferred, digest, {
          status: 'failed',
          attempts: 1,
          next_attempt_at: retryAt,
        })],
      });
    await expect(claimStripeWebhookEvent(deferred, digest)).resolves.toEqual({
      kind: 'duplicate',
      status: 'failed',
      attempts: 1,
      nextAttemptAt: retryAt,
    });
    expect(query.mock.calls[0][0].text).toContain('next_attempt_at <= NOW()');
    expect(query.mock.calls[0][0].text).toContain(
      'stripe_webhook_events.payload_sha256 = EXCLUDED.payload_sha256',
    );
  });

  it.each([
    ['payload digest', { digest: 'd'.repeat(64) }],
    ['event type', { type: 'customer.subscription.deleted' }],
    ['created timestamp', { created: 1_700_000_001 }],
    ['livemode', { livemode: false }],
  ])('fails closed when a repeated event ID changes %s', async (_label, change) => {
    const incoming = { ...event('evt_identity_conflict'), ...change } as Stripe.Event;
    const recordedEvent = event('evt_identity_conflict');
    const recordedDigest = 'a'.repeat(64);
    const incomingDigest = (change as { digest?: string }).digest || recordedDigest;
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [recordedIdentity(recordedEvent, recordedDigest)],
      });
    await expect(claimStripeWebhookEvent(incoming, incomingDigest))
      .rejects.toThrow('Stripe webhook event identity conflict');
  });

  it('returns dead_letter after the bounded attempt budget is exhausted', async () => {
    query.mockResolvedValueOnce({ rows: [{ status: 'dead_letter' }] });
    await expect(failStripeWebhookEvent('evt_exhausted', 'claim-5', new Error('still failing')))
      .resolves.toBe('dead_letter');
  });
});