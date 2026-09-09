import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { ConnectionLease, getDb, withConnection } from '../lib/db';

const OPERATOR_QUERY_DEADLINE_MS = 5_000;
const DRIVER_SETTLEMENT_DEADLINE_MS = 6_500;
const AMBIGUOUS_RESOLUTION_DEADLINE_MS = 15_000;
const SETTLEMENT_QUERY_TIMEOUT_MS = 2_500;

class AmbiguousRequeueError extends Error {
  constructor(
    readonly eventId: string,
    readonly operationToken: string,
    readonly backendPid: number,
    readonly originalError: unknown,
  ) {
    super('Stripe webhook recovery settlement was ambiguous');
  }
}

function isAmbiguousPostgresClientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return (
    code === 'ECONNRESET'
    || code === 'EPIPE'
    || code === 'ETIMEDOUT'
    || code?.startsWith('08') === true
    || /query read timeout|connection terminated|connection ended unexpectedly/i.test(error.message)
  );
}

async function operatorQuery(
  client: PoolClient,
  lease: ConnectionLease,
  text: string,
  values: unknown[] = [],
  quarantineOnRejection = false,
) {
  try {
    return await client.query({
      text,
      values,
      query_timeout: DRIVER_SETTLEMENT_DEADLINE_MS,
    } as any);
  } catch (error) {
    if (quarantineOnRejection || isAmbiguousPostgresClientError(error)) {
      lease.quarantine(error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  }
}

async function resolveAmbiguousRequeue(error: AmbiguousRequeueError): Promise<void> {
  const { pool } = getDb();
  const deadlineAt = Date.now() + AMBIGUOUS_RESOLUTION_DEADLINE_MS;
  while (Date.now() < deadlineAt) {
    try {
      const committed = () => pool.query({
        text: `SELECT 1 FROM stripe_webhook_requeue_operations
                WHERE operation_token = $1 AND event_id = $2`,
        values: [error.operationToken, error.eventId],
        query_timeout: SETTLEMENT_QUERY_TIMEOUT_MS,
      } as any);
      if ((await committed()).rowCount === 1) return;
      const backend = await pool.query({
        text: 'SELECT 1 FROM pg_stat_activity WHERE pid = $1',
        values: [error.backendPid],
        query_timeout: SETTLEMENT_QUERY_TIMEOUT_MS,
      } as any);
      if (backend.rowCount === 0) {
        if ((await committed()).rowCount === 1) return;
        throw new Error('Stripe webhook recovery transaction rolled back after connection failure');
      }
    } catch (settlementError) {
      if (
        settlementError instanceof Error
        && settlementError.message.includes('transaction rolled back')
      ) {
        throw settlementError;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Stripe webhook recovery outcome is unknown; operation ${error.operationToken} requires reconciliation`,
  );
}

export type StripeWebhookRequeueResult = 'requeued' | 'already_requeued';

export async function requeueStripeWebhookEvent(
  eventId: string,
): Promise<StripeWebhookRequeueResult> {
  const operationToken = randomUUID();
  try {
    return await withConnection(async (client, lease) => {
      const backendPid = Number(
        (await operatorQuery(client, lease, 'SELECT pg_backend_pid() AS pid')).rows[0].pid,
      );
      let transactionStarted = false;
      try {
        await operatorQuery(client, lease, 'BEGIN', [], true);
        transactionStarted = true;
        await operatorQuery(
          client,
          lease,
          `SET LOCAL statement_timeout = '${OPERATOR_QUERY_DEADLINE_MS}ms'`,
        );
        await operatorQuery(
          client,
          lease,
          `SET LOCAL lock_timeout = '${OPERATOR_QUERY_DEADLINE_MS}ms'`,
        );
        const result = await operatorQuery(
          client,
          lease,
          `UPDATE stripe_webhook_events
              SET status = 'failed', attempts = 0, next_attempt_at = NOW(),
                  outcome = 'operator_requeued',
                  last_error = NULL, claim_token = NULL, updated_at = NOW()
            WHERE event_id = $1 AND status IN ('failed', 'dead_letter')
              AND outcome IS DISTINCT FROM 'operator_requeued'
            RETURNING event_id`,
          [eventId],
        );
        if (result.rowCount !== 1) {
          const existing = await operatorQuery(
            client,
            lease,
            `SELECT e.status, e.outcome,
                    EXISTS (
                      SELECT 1 FROM stripe_webhook_requeue_operations o
                       WHERE o.event_id = e.event_id
                    ) AS has_requeue_evidence
               FROM stripe_webhook_events e WHERE e.event_id = $1`,
            [eventId],
          );
          if (existing.rows[0]?.has_requeue_evidence === true) {
            await operatorQuery(client, lease, 'ROLLBACK', [], true);
            transactionStarted = false;
            return 'already_requeued';
          }
          throw new Error('Event not found or not recoverable');
        }
        await operatorQuery(
          client,
          lease,
          `INSERT INTO stripe_webhook_requeue_operations (operation_token, event_id)
           VALUES ($1, $2)`,
          [operationToken, eventId],
        );
        await operatorQuery(client, lease, 'COMMIT', [], true);
        transactionStarted = false;
        return 'requeued';
      } catch (error) {
        if (transactionStarted && !lease.isQuarantined()) {
          try {
            await operatorQuery(client, lease, 'ROLLBACK', [], true);
            transactionStarted = false;
          } catch {
            // operatorQuery quarantines every unsuccessful rollback.
          }
        }
        if (lease.isQuarantined()) {
          throw new AmbiguousRequeueError(eventId, operationToken, backendPid, error);
        }
        throw error;
      }
    });
  } catch (error) {
    if (!(error instanceof AmbiguousRequeueError)) throw error;
    await resolveAmbiguousRequeue(error);
    return 'requeued';
  }
}

export async function main(): Promise<void> {
  const command = process.argv[2] || 'list';
  const eventId = process.argv[3];
  const { pool } = getDb();
  try {
    if (command === 'list') {
      const result = await pool.query({
        text: `SELECT event_id, event_type, status, attempts, next_attempt_at,
                      outcome, tenant_id, last_error, updated_at
                 FROM stripe_webhook_events
                WHERE status IN ('failed', 'dead_letter')
                ORDER BY updated_at ASC
                LIMIT 100`,
        query_timeout: DRIVER_SETTLEMENT_DEADLINE_MS,
      } as any);
      console.log(JSON.stringify(result.rows, null, 2));
      return;
    }
    if (command === 'requeue') {
      if (!eventId || !/^evt_[A-Za-z0-9_]+$/.test(eventId)) {
        throw new Error('Usage: reconcile:stripe-webhooks requeue evt_...');
      }
      const result = await requeueStripeWebhookEvent(eventId);
      if (result === 'already_requeued') {
        console.log(`Already requeued ${eventId}; no additional operation was recorded.`);
      } else {
        console.log(`Requeued ${eventId}; autonomous recovery will retry it after confirming tenant mapping.`);
      }
      return;
    }
    throw new Error('Usage: reconcile:stripe-webhooks [list|requeue evt_...]');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}