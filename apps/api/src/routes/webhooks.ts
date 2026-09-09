import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import type { PoolClient } from 'pg';
import { ConnectionLease, withConnection, withTransaction } from '../lib/db';
import { sendErrorResponse, ErrorCodes } from '../lib/errors';
import { AuthenticatedRequest, TenantState } from '../types';
import { performanceMonitor } from '../lib/logger';
import { normalizeSubscriptionStatus, stripeGraceDays } from '../lib/subscriptionStatus';
import { withDeadline } from '@sinna/types';
import {
  claimStripeWebhookEvent,
  claimRecoverableStripeWebhookEvents,
  completeStripeWebhookEvent,
  failStripeWebhookEvent,
  type StripeWebhookRecoveryClaim,
  stripeRawPayloadSha256,
} from '../lib/stripeWebhookInbox';

function isExplicitTestBypass(): boolean {
  // STRIPE_TESTING is never sufficient by itself. Production-like processes
  // must always have a Stripe client, secret, raw body, and valid signature.
  return process.env.NODE_ENV === 'test' && process.env.STRIPE_TESTING === 'true';
}

const STRIPE_WEBHOOK_PROCESSING_DEADLINE_MS = 9_000;
const STRIPE_WEBHOOK_TRANSACTION_BUDGET_MS = 6_500;
const STRIPE_WEBHOOK_SETTLEMENT_DEADLINE_MS = 1_000;
const STRIPE_WEBHOOK_RECOVERY_INTERVAL_MS = 30_000;

interface StripeTransactionClient {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

function cumulativeDeadlineClient(
  client: PoolClient,
  deadlineAt: number,
  lease: ConnectionLease,
): StripeTransactionClient {
  return {
    async query(text: string, values: unknown[] = []) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) throw new Error('Stripe webhook transaction budget exhausted');
      await boundedRawQuery(
        client,
        `SET LOCAL statement_timeout = '${remainingMs}ms'`,
        remainingMs,
        'Stripe webhook statement-timeout setup deadline exceeded',
        lease,
      );
      const operation = client.query({
        text,
        values,
        query_timeout: remainingMs,
      } as any) as Promise<{ rows: any[]; rowCount?: number | null }>;
      try {
        return await withQuarantinedDeadline(
          operation,
          remainingMs,
          'Stripe webhook transaction query deadline exceeded',
          lease,
        );
      } catch (error) {
        if (isAmbiguousPostgresClientError(error)) {
          lease.quarantine(error instanceof Error ? error : new Error(String(error)));
        }
        throw error;
      }
    },
  };
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

async function boundedRawQuery(
  client: PoolClient,
  text: string,
  timeoutMs: number,
  message: string,
  lease: ConnectionLease,
  quarantineOnRejection = false,
): Promise<{ rows: any[]; rowCount?: number | null }> {
  const operation = client.query({ text, query_timeout: timeoutMs + 250 } as any) as Promise<{
    rows: any[];
    rowCount?: number | null;
  }>;
  try {
    return await withQuarantinedDeadline(operation, timeoutMs, message, lease);
  } catch (error) {
    if (quarantineOnRejection || isAmbiguousPostgresClientError(error)) {
      lease.quarantine(error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  }
}

async function withQuarantinedDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
  lease: ConnectionLease,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(message);
          lease.quarantine(error);
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withBoundedStripeWebhookTransaction<T>(
  work: (client: StripeTransactionClient) => Promise<T>,
): Promise<T> {
  return withConnection(async (client, lease) => {
    const deadlineAt = Date.now() + STRIPE_WEBHOOK_TRANSACTION_BUDGET_MS;
    const remaining = () => Math.max(1, deadlineAt - Date.now());
    let transactionStarted = false;
    try {
      await boundedRawQuery(
        client,
        'BEGIN',
        remaining(),
        'Stripe webhook BEGIN deadline exceeded',
        lease,
        true,
      );
      transactionStarted = true;
      await boundedRawQuery(
        client,
        `SET LOCAL statement_timeout = '${remaining()}ms'`,
        remaining(),
        'Stripe webhook transaction setup deadline exceeded',
        lease,
      );
      await boundedRawQuery(
        client,
        "SET LOCAL lock_timeout = '2000ms'",
        remaining(),
        'Stripe webhook lock-timeout setup deadline exceeded',
        lease,
      );
      const result = await work(cumulativeDeadlineClient(client, deadlineAt, lease));
      await boundedRawQuery(
        client,
        'COMMIT',
        remaining(),
        'Stripe webhook COMMIT deadline exceeded',
        lease,
        true,
      );
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted && !lease.isQuarantined()) {
        try {
          await boundedRawQuery(
            client,
            'ROLLBACK',
            STRIPE_WEBHOOK_SETTLEMENT_DEADLINE_MS,
            'Stripe webhook ROLLBACK deadline exceeded',
            lease,
            true,
          );
          transactionStarted = false;
        } catch (rollbackError) {
          lease.quarantine(
            rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)),
          );
          console.error('[Stripe Webhook] Rollback failed:', rollbackError);
        }
      }
      throw error;
    }
  });
}

export async function waitForStripeWebhookTransactionSettlement(
  processing: Promise<unknown>,
  isSettled: () => boolean,
  timeoutMs = STRIPE_WEBHOOK_SETTLEMENT_DEADLINE_MS,
): Promise<boolean> {
  if (isSettled()) return true;
  try {
    await withDeadline(
      processing.then(
        () => undefined,
        () => undefined,
      ),
      timeoutMs,
      'Stripe webhook transaction settlement deadline exceeded',
    );
  } catch {
    return isSettled();
  }
  return isSettled();
}

type StripeWebhookLogger = Pick<FastifyRequest['log'], 'info' | 'warn' | 'error'>;

function retrievedEventMatchesClaim(
  event: Stripe.Event,
  claim: StripeWebhookRecoveryClaim,
): boolean {
  return (
    event.id === claim.eventId
    && event.type === claim.eventType
    && event.created === claim.eventCreated
    && event.livemode === claim.livemode
  );
}

export async function retrieveStripeEventForRecovery(
  stripe: Stripe,
  eventId: string,
  timeoutMs = 5_000,
): Promise<Stripe.Event> {
  return withDeadline(
    stripe.events.retrieve(eventId, {
      timeout: timeoutMs,
      maxNetworkRetries: 0,
    }),
    timeoutMs,
    'Stripe webhook recovery retrieval deadline exceeded',
  );
}

async function recoverClaimedStripeWebhookEvent(
  stripe: Stripe,
  claim: StripeWebhookRecoveryClaim,
  tenants: Map<string, TenantState>,
  log: StripeWebhookLogger,
): Promise<void> {
  let processing: Promise<StripeWebhookProcessingResult> | undefined;
  let transactionSettled = false;
  try {
    const event = await retrieveStripeEventForRecovery(stripe, claim.eventId);
    if (!retrievedEventMatchesClaim(event, claim)) {
      throw new Error('Stripe webhook recovery event identity conflict');
    }
    const request = { log } as FastifyRequest;
    processing = withBoundedStripeWebhookTransaction(async (client) => {
      const result = await processStripeWebhookEvent(event, request, client);
      await completeStripeWebhookEvent(
        client,
        claim.eventId,
        claim.claimToken,
        result.outcome,
        result.tenantId,
      );
      return result;
    }).finally(() => {
      transactionSettled = true;
    });
    const result = await withDeadline(
      processing,
      STRIPE_WEBHOOK_PROCESSING_DEADLINE_MS,
      'Stripe webhook autonomous recovery deadline exceeded',
    );
    if (result.tenantId && result.cache) {
      updateCachedTenant(
        tenants,
        result.tenantId,
        result.cache.active,
        result.cache.graceUntil,
        result.cache.resetUsage,
      );
    }
    log.info(
      {
        eventId: claim.eventId,
        eventType: claim.eventType,
        attempt: claim.attempt,
        outcome: result.outcome,
        tenantId: result.tenantId,
      },
      'Stripe webhook autonomous recovery completed',
    );
  } catch (error) {
    if (!transactionSettled && processing) {
      transactionSettled = await waitForStripeWebhookTransactionSettlement(
        processing,
        () => transactionSettled,
      );
    }
    if (!processing || transactionSettled) {
      try {
        await failStripeWebhookEvent(
          claim.eventId,
          claim.claimToken,
          new Error(
            error instanceof Error && error.message.includes('identity conflict')
              ? 'Stripe webhook recovery event identity conflict'
              : 'Stripe webhook autonomous recovery failed',
          ),
        );
      } catch {
        // A committed completion or newer claim can legitimately make failure recording lose its token.
      }
    }
    log.error(
      {
        eventId: claim.eventId,
        eventType: claim.eventType,
        attempt: claim.attempt,
        transactionSettled,
      },
      'Stripe webhook autonomous recovery failed',
    );
  }
}

export async function recoverStripeWebhookInboxOnce(
  stripe: Stripe,
  tenants: Map<string, TenantState>,
  log: StripeWebhookLogger,
  limit = 10,
): Promise<number> {
  const claims = await claimRecoverableStripeWebhookEvents(limit);
  await Promise.all(
    claims.map((claim) => recoverClaimedStripeWebhookEvent(stripe, claim, tenants, log)),
  );
  return claims.length;
}

function startStripeWebhookRecovery(
  app: FastifyInstance,
  stripe: Stripe,
  tenants: Map<string, TenantState>,
): void {
  let running = false;
  let closing = false;
  let activeSweep: Promise<void> | undefined;
  const run = () => {
    if (closing || running) return;
    activeSweep = (async () => {
      running = true;
      try {
        await recoverStripeWebhookInboxOnce(stripe, tenants, app.log);
      } catch {
        app.log.error(
          { component: 'stripe_webhook_recovery' },
          'Stripe webhook autonomous recovery sweep failed',
        );
      } finally {
        running = false;
      }
    })();
  };
  const timer = setInterval(run, STRIPE_WEBHOOK_RECOVERY_INTERVAL_MS);
  timer.unref();
  const initial = setTimeout(run, 0);
  initial.unref();
  app.addHook('onClose', async () => {
    closing = true;
    clearTimeout(initial);
    clearInterval(timer);
    await activeSweep;
  });
}

export function registerWebhookRoutes(app: FastifyInstance, stripe: Stripe | null, tenants: Map<string, TenantState>): void {
  if (stripe && process.env.NODE_ENV !== 'test') {
    startStripeWebhookRecovery(app, stripe, tenants);
  }
  app.post('/webhooks/stripe', {
    config: { rawBody: true },
    schema: {
      description: 'Stripe webhook endpoint for subscription events',
      tags: ['Webhooks'],
      hide: true, // Webhook endpoint, hide from public docs
      headers: {
        type: 'object',
        properties: {
          'stripe-signature': {
            type: 'string',
            description: 'Stripe webhook signature for verification'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            received: { type: 'boolean' }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        },
        503: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (req: FastifyRequest, res: FastifyReply) => {
    const perfId = performanceMonitor.start('stripe_webhook', (req as AuthenticatedRequest).requestId);
    
    try {
      const sig = req.headers['stripe-signature'];
      const isProduction = process.env.NODE_ENV === 'production';
      const webhookSecret = isProduction
        ? process.env.STRIPE_WEBHOOK_SECRET_LIVE || ''
        : process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET_LIVE || '';
      const rawBody = (req as AuthenticatedRequest).rawBody;
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        return res.code(400).send({ success: false, error: 'missing_body' });
      }

      const isTesting = isExplicitTestBypass();
      if (!isTesting && (!stripe || !webhookSecret)) {
        return res.code(503).send({ success: false, error: ErrorCodes.STRIPE_UNCONFIGURED });
      }
      if (!isTesting && typeof sig !== 'string') {
        return res.code(400).send({ success: false, error: 'missing_signature' });
      }

      let event: Stripe.Event;
      
      if (isTesting) {
        try {
          event = JSON.parse(rawBody.toString()) as Stripe.Event;
          req.log.info('Testing mode: Using raw webhook payload as event');
        } catch (err) {
          req.log.error({ err }, 'Failed to parse webhook payload in testing mode');
          return res.code(400).send({ success: false, error: 'Invalid payload' });
        }
      } else {
        try {
          event = stripe!.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
        } catch (err) {
          req.log.warn(
            { component: 'stripe_webhook_signature', reason: 'verification_failed' },
            'Stripe signature verification failed',
          );
          return res.code(400).send({ success: false, error: 'Invalid signature' });
        }
      }

      if (isProduction && event.livemode !== true) {
        req.log.error({ eventId: event.id, eventType: event.type }, 'Rejected non-live Stripe event');
        return res.code(400).send({ success: false, error: 'stripe_mode_mismatch' });
      }

      const claim = await claimStripeWebhookEvent(event, stripeRawPayloadSha256(rawBody));
      if (claim.kind === 'duplicate') {
        req.log.info(
          { eventId: event.id, status: claim.status, attempts: claim.attempts },
          'Ignoring duplicate or terminal Stripe webhook event',
        );
        if (claim.status === 'failed') {
          const retryAfterSeconds = claim.nextAttemptAt
            ? Math.max(1, Math.ceil((claim.nextAttemptAt.getTime() - Date.now()) / 1_000))
            : 1;
          res.header('Retry-After', retryAfterSeconds);
          return res.code(503).send({ success: false, error: 'stripe_webhook_retry_deferred' });
        }
        return res.send({ received: true });
      }

      let transactionSettled = false;
      let processing: Promise<StripeWebhookProcessingResult> | undefined;
      try {
        processing = withBoundedStripeWebhookTransaction(async (client) => {
          const result = await processStripeWebhookEvent(event, req, client);
          await completeStripeWebhookEvent(
            client,
            event.id,
            claim.claimToken,
            result.outcome,
            result.tenantId,
          );
          return result;
        }).finally(() => {
          transactionSettled = true;
        });
        const result = await withDeadline(
          processing,
          STRIPE_WEBHOOK_PROCESSING_DEADLINE_MS,
          'Stripe webhook processing deadline exceeded',
        );
        if (result.tenantId && result.cache) {
          updateCachedTenant(
            tenants,
            result.tenantId,
            result.cache.active,
            result.cache.graceUntil,
            result.cache.resetUsage,
          );
        }
        req.log.info(
          {
            eventId: event.id,
            eventType: event.type,
            attempt: claim.attempt,
            outcome: result.outcome,
            tenantId: result.tenantId,
          },
          'Stripe webhook processing completed',
        );
        return res.send({ received: true });
      } catch (error) {
        if (!transactionSettled && processing) {
          transactionSettled = await waitForStripeWebhookTransactionSettlement(
            processing,
            () => transactionSettled,
          );
        }
        if (!transactionSettled) {
          req.log.error(
            { eventId: event.id, eventType: event.type, attempt: claim.attempt },
            'Leaving unsettled Stripe webhook claim for stale-lease recovery',
          );
          throw error;
        }
        const status = await failStripeWebhookEvent(event.id, claim.claimToken, error);
        req.log.error(
          { error, eventId: event.id, eventType: event.type, attempt: claim.attempt, status },
          'Stripe webhook processing failed',
        );
        if (status === 'dead_letter') return res.send({ received: true });
        throw error;
      }
    } catch (error) {
      req.log.error({ error }, 'Webhook processing error');
      return sendErrorResponse(res, error instanceof Error ? error : new Error(String(error)));
    } finally {
      performanceMonitor.end(perfId);
    }
  });
}

interface StripeLifecycleMutation {
  status: ReturnType<typeof normalizeSubscriptionStatus>;
  active: boolean;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  lookupStripeSubscriptionId?: string;
  expiresAt: Date | null;
  graceUntil: Date | null;
}

interface AppliedStripeLifecycle {
  tenantId: string;
  applied: boolean;
}

interface StripeWebhookProcessingResult {
  outcome: 'applied' | 'stale' | 'ownership_boundary' | 'unsupported';
  tenantId?: string;
  cache?: {
    active: boolean;
    graceUntil: Date | null;
    resetUsage?: boolean;
  };
}

async function processStripeWebhookEvent(
  event: Stripe.Event,
  req: FastifyRequest,
  client: StripeTransactionClient,
): Promise<StripeWebhookProcessingResult> {
  switch (event.type) {
    case 'invoice.payment_succeeded':
      return handleInvoicePaymentSucceeded(event, req, client);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event, req, client);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event, req, client);
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(event, req, client);
    case 'checkout.session.completed':
      req.log.info(
        { eventId: event.id, eventType: event.type },
        'Acknowledging checkout without mutation; onboarding owns billing and provisioning',
      );
      return { outcome: 'ownership_boundary' };
    default:
      req.log.info(
        { eventId: event.id, eventType: event.type },
        'Recording unsupported Stripe event without projection mutation',
      );
      return { outcome: 'unsupported' };
  }
}

/**
 * Locks the tenant row and advances both its lifecycle and Stripe ordering
 * cursor atomically. Stripe timestamps have one-second precision, so event ID
 * provides a stable total order for distinct events created in the same second.
 */
export async function applyStripeLifecycleMutation(
  event: Pick<Stripe.Event, 'id' | 'created'>,
  mutation: StripeLifecycleMutation,
  transactionClient?: StripeTransactionClient,
): Promise<AppliedStripeLifecycle | null> {
  if (!event.id || !Number.isSafeInteger(event.created) || event.created < 0) {
    throw new Error('Stripe lifecycle event has invalid ordering metadata');
  }

  const apply = async (client: StripeTransactionClient): Promise<AppliedStripeLifecycle | null> => {
    const lookupSubscriptionId = mutation.lookupStripeSubscriptionId
      || mutation.stripeSubscriptionId;
    const lookup = lookupSubscriptionId
      ? await client.query(
        `SELECT id, stripe_customer_id, stripe_subscription_id, status, active, grace_until,
                stripe_event_created, stripe_event_id
           FROM tenants
          WHERE stripe_subscription_id = $1 OR stripe_customer_id = $2
          ORDER BY CASE WHEN stripe_subscription_id = $1 THEN 0 ELSE 1 END
          FOR UPDATE`,
        [lookupSubscriptionId, mutation.stripeCustomerId],
      )
      : await client.query(
        `SELECT id, stripe_customer_id, stripe_subscription_id, status, active, grace_until,
                stripe_event_created, stripe_event_id
           FROM tenants WHERE stripe_customer_id = $1 LIMIT 1 FOR UPDATE`,
        [mutation.stripeCustomerId],
      );

    if (lookup.rows.length === 0) return null;
    if (lookup.rows.length > 1) {
      throw new Error('Conflicting Stripe customer and subscription tenant mappings');
    }
    const row = lookup.rows[0] as {
      id: string;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      status: string;
      active: boolean;
      grace_until: Date | string | null;
      stripe_event_created: string | number | null;
      stripe_event_id: string | null;
    };
    if (
      (row.stripe_customer_id && row.stripe_customer_id !== mutation.stripeCustomerId)
      || (
        lookupSubscriptionId
        && row.stripe_subscription_id
        && row.stripe_subscription_id !== lookupSubscriptionId
      )
    ) {
      throw new Error('Conflicting Stripe identifiers on tenant projection');
    }
    const previousCreated = row.stripe_event_created === null ? null : Number(row.stripe_event_created);
    const previousRestriction = row.active
      ? 0
      : row.status === 'expired'
        ? 3
        : row.grace_until
          ? 1
          : 2;
    const incomingRestriction = mutation.active
      ? 0
      : mutation.status === 'expired'
        ? 3
        : mutation.graceUntil
          ? 1
          : 2;
    const previousEventId = row.stripe_event_id || '';
    const isStale = previousCreated !== null && (
      event.created < previousCreated
      || (
        event.created === previousCreated
        && (
          incomingRestriction < previousRestriction
          || (
            incomingRestriction === previousRestriction
            && event.id <= previousEventId
          )
        )
      )
    );
    if (isStale) return { tenantId: row.id, applied: false };

    await client.query(
      `UPDATE tenants
          SET status = $1,
              active = $2,
              expires_at = $3,
              grace_until = $4,
              stripe_subscription_id = $5,
              stripe_event_created = $6,
              stripe_event_id = $7
        WHERE id = $8`,
      [
        mutation.status,
        mutation.active,
        mutation.expiresAt,
        mutation.graceUntil,
        mutation.stripeSubscriptionId,
        event.created,
        event.id,
        row.id,
      ],
    );
    return { tenantId: row.id, applied: true };
  };
  return transactionClient
    ? apply(transactionClient)
    : withTransaction((client) => apply(client as StripeTransactionClient));
}

function updateCachedTenant(
  tenants: Map<string, TenantState>,
  tenantId: string,
  active: boolean,
  graceUntil: Date | null,
  resetUsage = false,
): void {
  const state = tenants.get(tenantId) || {
    active: false,
    usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
  } as TenantState;
  state.active = active;
  state.graceUntil = graceUntil?.getTime();
  if (resetUsage) {
    state.usage.requests = 0;
    state.usage.minutes = 0;
    state.usage.jobs = 0;
    state.usage.storage = 0;
  }
  tenants.set(tenantId, state);
}

export function invoicePeriodEnd(invoice: Stripe.Invoice): Date {
  const periodEnds = invoice.lines?.data
    .map((line) => line.period?.end)
    .filter((end): end is number => Number.isSafeInteger(end) && end > 0) || [];
  if (periodEnds.length === 0) {
    throw new Error('invoice.payment_succeeded is missing an authoritative invoice line period end');
  }
  return new Date(Math.max(...periodEnds) * 1000);
}

export function stripeGraceUntil(eventCreated: number, graceDays: number): Date {
  if (!Number.isSafeInteger(eventCreated) || eventCreated < 0) {
    throw new Error('Stripe lifecycle event has invalid ordering metadata');
  }
  return new Date(eventCreated * 1_000 + graceDays * 24 * 60 * 60 * 1_000);
}

async function handleInvoicePaymentSucceeded(
  event: Stripe.Event,
  req: FastifyRequest,
  client: StripeTransactionClient,
): Promise<StripeWebhookProcessingResult> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || '';
  
  if (!stripeCustomerId) {
    throw new Error('invoice.payment_succeeded is missing customer ID');
  }

  const expiresAt = invoicePeriodEnd(invoice);
  const stripeSubscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : null;
  if (!stripeSubscriptionId) {
    throw new Error('invoice.payment_succeeded is missing subscription ID');
  }
  const result = await applyStripeLifecycleMutation(event, {
    status: normalizeSubscriptionStatus('active'),
    active: true,
    stripeCustomerId,
    stripeSubscriptionId,
    expiresAt,
    graceUntil: null,
  }, client);
  if (!result) {
    throw new Error('Tenant mapping not found for invoice.payment_succeeded');
  }
  if (!result.applied) {
    req.log.info({ eventId: event.id, tenantId: result.tenantId }, 'Ignoring stale Stripe lifecycle event');
    return { outcome: 'stale', tenantId: result.tenantId };
  }
  req.log.info({ tenantId: result.tenantId, expiresAt }, 'Invoice payment succeeded, tenant activated and expiration updated');
  return {
    outcome: 'applied',
    tenantId: result.tenantId,
    cache: { active: true, graceUntil: null, resetUsage: true },
  };
}

async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  req: FastifyRequest,
  client: StripeTransactionClient,
): Promise<StripeWebhookProcessingResult> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || '';
  const stripeSubscriptionId = invoice.subscription as string | undefined;
  
  if (!stripeCustomerId) {
    throw new Error('invoice.payment_failed is missing customer ID');
  }
  if (typeof stripeSubscriptionId !== 'string' || !stripeSubscriptionId) {
    throw new Error('invoice.payment_failed is missing subscription ID');
  }

  const graceDays = stripeGraceDays();
  const graceUntil = stripeGraceUntil(event.created, graceDays);
  const result = await applyStripeLifecycleMutation(event, {
    status: normalizeSubscriptionStatus('past_due'),
    active: false,
    stripeCustomerId,
    stripeSubscriptionId,
    expiresAt: null,
    graceUntil,
  }, client);
  if (!result) {
    throw new Error('Tenant mapping not found for invoice.payment_failed');
  }
  if (!result.applied) return { outcome: 'stale', tenantId: result.tenantId };
  req.log.warn({ tenantId: result.tenantId, graceUntil }, 'Payment failed - entered grace period');
  return {
    outcome: 'applied',
    tenantId: result.tenantId,
    cache: { active: false, graceUntil },
  };
}

async function handleSubscriptionDeleted(
  event: Stripe.Event,
  req: FastifyRequest,
  client: StripeTransactionClient,
): Promise<StripeWebhookProcessingResult> {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || '';
  
  if (!stripeSubscriptionId) {
    throw new Error('customer.subscription.deleted is missing subscription ID');
  }

  const authoritativeEnd = subscription.ended_at
    || subscription.canceled_at
    || subscription.current_period_end;
  const result = await applyStripeLifecycleMutation(event, {
    status: normalizeSubscriptionStatus('canceled'),
    active: false,
    stripeCustomerId,
    stripeSubscriptionId: null,
    lookupStripeSubscriptionId: stripeSubscriptionId,
    expiresAt: authoritativeEnd ? new Date(authoritativeEnd * 1000) : null,
    graceUntil: null,
  }, client);
  if (!result) {
    throw new Error('Tenant mapping not found for customer.subscription.deleted');
  }
  if (!result.applied) return { outcome: 'stale', tenantId: result.tenantId };
  req.log.warn({ tenantId: result.tenantId }, 'Subscription deleted - tenant deactivated and marked as expired');
  return {
    outcome: 'applied',
    tenantId: result.tenantId,
    cache: { active: false, graceUntil: null },
  };
}

async function handleSubscriptionUpdated(
  event: Stripe.Event,
  req: FastifyRequest,
  client: StripeTransactionClient,
): Promise<StripeWebhookProcessingResult> {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || '';
  const status = subscription.status;
  
  if (!stripeSubscriptionId) {
    throw new Error('customer.subscription.updated is missing subscription ID');
  }

  if (!stripeCustomerId) {
    throw new Error('customer.subscription.updated is missing customer ID');
  }
  const tenantStatus = normalizeSubscriptionStatus(status);
  const isActive = tenantStatus === 'active';
  const periodEnd = subscription.current_period_end;
  if (isActive && (!Number.isSafeInteger(periodEnd) || periodEnd <= 0)) {
    throw new Error('Entitled subscription update is missing current_period_end');
  }
  const result = await applyStripeLifecycleMutation(event, {
    status: tenantStatus,
    active: isActive,
    stripeCustomerId,
    stripeSubscriptionId,
    expiresAt: periodEnd ? new Date(periodEnd * 1000) : null,
    graceUntil: null,
  }, client);
  if (!result) {
    throw new Error('Tenant mapping not found for customer.subscription.updated');
  }
  if (!result.applied) return { outcome: 'stale', tenantId: result.tenantId };
  req.log.info({ tenantId: result.tenantId, status }, 'Subscription updated - tenant status changed');
  
  // Send notification for status changes
  // Note: To get customer email, we would need to fetch customer from Stripe
  // For now, log the status change - email notifications can be handled via Stripe's built-in emails
  if (status === 'past_due' || status === 'unpaid') {
    req.log.warn({ tenantId: result.tenantId, status }, 'Subscription status issue - tenant may need attention');
    // Stripe typically sends its own emails for payment issues, so we don't duplicate here
  }
  return {
    outcome: 'applied',
    tenantId: result.tenantId,
    cache: { active: isActive, graceUntil: null },
  };
}

