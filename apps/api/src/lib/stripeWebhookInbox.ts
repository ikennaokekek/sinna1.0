import type Stripe from 'stripe';
import { createHash, randomUUID } from 'crypto';
import { getDb } from './db';
import { withDeadline } from '@sinna/types';

export const STRIPE_WEBHOOK_MAX_ATTEMPTS = 5;
const EVENT_CLAIM_STALE_AFTER = '15 minutes';
const INBOX_QUERY_TIMEOUT_MS = 2_500;
const INBOX_QUERY_DEADLINE_MS = 3_000;

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export type StripeWebhookClaim =
  | { kind: 'claimed'; claimToken: string; attempt: number }
  | { kind: 'duplicate'; status: string; attempts: number; nextAttemptAt?: Date };

export interface StripeWebhookRecoveryClaim {
  eventId: string;
  eventType: string;
  eventCreated: number;
  livemode: boolean;
  payloadSha256: string;
  claimToken: string;
  attempt: number;
}

async function inboxQuery(text: string, values: unknown[], message: string) {
  const { pool } = getDb();
  const operation = pool.query({
    text,
    values,
    query_timeout: INBOX_QUERY_TIMEOUT_MS,
  } as any) as Promise<{ rows: any[]; rowCount?: number | null }>;
  return withDeadline(operation, INBOX_QUERY_DEADLINE_MS, message);
}

export function stripeRawPayloadSha256(rawBody: Buffer): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

export async function claimStripeWebhookEvent(
  event: Stripe.Event,
  payloadSha256: string,
): Promise<StripeWebhookClaim> {
  const claimToken = randomUUID();
  if (!/^[0-9a-f]{64}$/.test(payloadSha256)) {
    throw new Error('Stripe webhook payload digest is invalid');
  }
  const result = await inboxQuery(
    `INSERT INTO stripe_webhook_events
       (event_id, event_type, event_created, livemode, payload_sha256, status, claim_token,
        processing_started_at, attempts, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'processing', $6, NOW(), 1, NOW())
     ON CONFLICT (event_id) DO UPDATE
       SET status = 'processing', claim_token = EXCLUDED.claim_token,
           processing_started_at = NOW(), attempts = stripe_webhook_events.attempts + 1,
           updated_at = NOW()
       WHERE ((
         stripe_webhook_events.status = 'failed'
          AND stripe_webhook_events.next_attempt_at <= NOW()
         AND stripe_webhook_events.attempts < $8
       ) OR (
         stripe_webhook_events.status = 'processing'
         AND stripe_webhook_events.processing_started_at < NOW() - $7::interval
         AND stripe_webhook_events.attempts < $8
        ))
       AND stripe_webhook_events.payload_sha256 = EXCLUDED.payload_sha256
       AND stripe_webhook_events.event_type = EXCLUDED.event_type
       AND stripe_webhook_events.event_created = EXCLUDED.event_created
       AND stripe_webhook_events.livemode = EXCLUDED.livemode
     RETURNING claim_token, attempts`,
    [
      event.id,
      event.type,
      event.created,
      event.livemode,
      payloadSha256,
      claimToken,
      EVENT_CLAIM_STALE_AFTER,
      STRIPE_WEBHOOK_MAX_ATTEMPTS,
    ],
    'Stripe webhook claim deadline exceeded',
  );
  if (result.rows[0]?.claim_token === claimToken) {
    return { kind: 'claimed', claimToken, attempt: Number(result.rows[0].attempts) };
  }
  const exhaustedLease = await inboxQuery(
    `UPDATE stripe_webhook_events
        SET status = 'dead_letter', outcome = 'lease_retry_exhausted',
            claim_token = NULL, updated_at = NOW()
      WHERE event_id = $1 AND status = 'processing' AND attempts >= $2
        AND processing_started_at < NOW() - $3::interval
        AND payload_sha256 = $4
        AND event_type = $5
        AND event_created = $6
        AND livemode = $7
       RETURNING status, attempts, next_attempt_at`,
    [
      event.id,
      STRIPE_WEBHOOK_MAX_ATTEMPTS,
      EVENT_CLAIM_STALE_AFTER,
      payloadSha256,
      event.type,
      event.created,
      event.livemode,
    ],
    'Stripe webhook exhausted lease recovery deadline exceeded',
  );
  if (exhaustedLease.rows[0]) {
    return {
      kind: 'duplicate',
      status: exhaustedLease.rows[0].status,
      attempts: Number(exhaustedLease.rows[0].attempts),
      nextAttemptAt: exhaustedLease.rows[0].next_attempt_at
        ? new Date(exhaustedLease.rows[0].next_attempt_at)
        : undefined,
    };
  }
  const existing = await inboxQuery(
    `SELECT status, attempts, next_attempt_at, payload_sha256, event_type, event_created, livemode
       FROM stripe_webhook_events
      WHERE event_id = $1`,
    [event.id],
    'Stripe webhook duplicate lookup deadline exceeded',
  );
  const recorded = existing.rows[0];
  if (
    recorded
    && (
      recorded.payload_sha256 !== payloadSha256
      || recorded.event_type !== event.type
      || String(recorded.event_created) !== String(event.created)
      || recorded.livemode !== event.livemode
    )
  ) {
    throw new Error('Stripe webhook event identity conflict');
  }
  return {
    kind: 'duplicate',
    status: String(recorded?.status || 'processing'),
    attempts: Number(recorded?.attempts || 0),
    nextAttemptAt: recorded?.next_attempt_at
      ? new Date(recorded.next_attempt_at)
      : undefined,
  };
}

export async function claimRecoverableStripeWebhookEvents(
  limit = 10,
): Promise<StripeWebhookRecoveryClaim[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Stripe webhook recovery claim limit is invalid');
  }
  await inboxQuery(
    `WITH exhausted AS (
       SELECT event_id
         FROM stripe_webhook_events
        WHERE status = 'processing' AND attempts >= $1
          AND processing_started_at < NOW() - $2::interval
        ORDER BY updated_at ASC, event_id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 100
     )
     UPDATE stripe_webhook_events AS event
        SET status = 'dead_letter', outcome = 'lease_retry_exhausted',
            claim_token = NULL, next_attempt_at = NULL, updated_at = NOW()
       FROM exhausted
      WHERE event.event_id = exhausted.event_id`,
    [STRIPE_WEBHOOK_MAX_ATTEMPTS, EVENT_CLAIM_STALE_AFTER],
    'Stripe webhook exhausted autonomous recovery deadline exceeded',
  );
  const result = await inboxQuery(
    `WITH candidates AS (
       SELECT event_id
         FROM stripe_webhook_events
        WHERE attempts < $1
          AND (
            (status = 'failed' AND next_attempt_at <= NOW())
            OR (
              status = 'processing'
              AND processing_started_at < NOW() - $2::interval
            )
          )
        ORDER BY updated_at ASC, event_id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $3
     )
     UPDATE stripe_webhook_events AS event
        SET status = 'processing', claim_token = gen_random_uuid(),
            processing_started_at = NOW(), attempts = event.attempts + 1,
            next_attempt_at = NULL, updated_at = NOW()
       FROM candidates
      WHERE event.event_id = candidates.event_id
     RETURNING event.event_id, event.event_type, event.event_created, event.livemode,
               event.payload_sha256, event.claim_token, event.attempts`,
    [STRIPE_WEBHOOK_MAX_ATTEMPTS, EVENT_CLAIM_STALE_AFTER, limit],
    'Stripe webhook autonomous recovery claim deadline exceeded',
  );
  return result.rows.map((row) => ({
    eventId: String(row.event_id),
    eventType: String(row.event_type),
    eventCreated: Number(row.event_created),
    livemode: Boolean(row.livemode),
    payloadSha256: String(row.payload_sha256),
    claimToken: String(row.claim_token),
    attempt: Number(row.attempts),
  }));
}

export async function completeStripeWebhookEvent(
  client: Queryable,
  eventId: string,
  claimToken: string,
  outcome: string,
  tenantId?: string,
): Promise<void> {
  const status = outcome === 'unsupported' || outcome === 'ownership_boundary' ? 'ignored' : 'completed';
  const result = await client.query(
    `UPDATE stripe_webhook_events
        SET status = $3, outcome = $4, tenant_id = $5, completed_at = NOW(), updated_at = NOW()
      WHERE event_id = $1 AND claim_token = $2 AND status = 'processing'`,
    [eventId, claimToken, status, outcome, tenantId || null],
  );
  if (result.rowCount !== 1) throw new Error('Stripe webhook completion claim was lost');
}

export async function failStripeWebhookEvent(
  eventId: string,
  claimToken: string,
  error: unknown,
): Promise<'failed' | 'dead_letter'> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
  const result = await inboxQuery(
    `UPDATE stripe_webhook_events
        SET status = CASE WHEN attempts >= $3 THEN 'dead_letter' ELSE 'failed' END,
            outcome = CASE WHEN attempts >= $3 THEN 'retry_exhausted' ELSE 'retryable_failure' END,
            next_attempt_at = CASE
              WHEN attempts >= $3 THEN NULL
              WHEN attempts = 1 THEN NOW() + interval '5 seconds'
              WHEN attempts = 2 THEN NOW() + interval '15 seconds'
              WHEN attempts = 3 THEN NOW() + interval '1 minute'
              ELSE NOW() + interval '5 minutes'
            END,
            last_error = $4, claim_token = NULL, updated_at = NOW()
      WHERE event_id = $1 AND claim_token = $2 AND status = 'processing'
       RETURNING status, next_attempt_at`,
    [eventId, claimToken, STRIPE_WEBHOOK_MAX_ATTEMPTS, message],
    'Stripe webhook failure recording deadline exceeded',
  );
  if (!result.rows[0]) throw new Error('Stripe webhook failure claim was lost');
  return result.rows[0].status;
}