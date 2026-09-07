import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { getDb, withTransaction } from '../lib/db';
import { sendEmailNotice } from '../lib/email';
import { sendErrorResponse, ErrorCodes } from '../lib/errors';
import { AuthenticatedRequest, TenantState } from '../types';
import { performanceMonitor } from '../lib/logger';
import { normalizeSubscriptionStatus } from '../lib/subscriptionStatus';

function isExplicitTestBypass(): boolean {
  // STRIPE_TESTING is never sufficient by itself. Production-like processes
  // must always have a Stripe client, secret, raw body, and valid signature.
  return process.env.NODE_ENV === 'test' && process.env.STRIPE_TESTING === 'true';
}

const EVENT_CLAIM_STALE_AFTER = '15 minutes';

/**
 * Claims a Stripe event durably. A completed claim is never replayed; an
 * abandoned processing claim can be retried after its lease, while ordinary
 * handler failures explicitly release their claim immediately.
 */
export async function claimStripeWebhookEvent(eventId: string): Promise<string | null> {
  const claimToken = randomUUID();
  const { pool } = getDb();
  const result = await pool.query(
    `INSERT INTO stripe_webhook_events (event_id, status, claim_token, processing_started_at)
     VALUES ($1, 'processing', $2, NOW())
     ON CONFLICT (event_id) DO UPDATE
       SET status = 'processing', claim_token = EXCLUDED.claim_token,
           processing_started_at = NOW(), completed_at = NULL
       WHERE stripe_webhook_events.status = 'processing'
         AND stripe_webhook_events.processing_started_at < NOW() - $3::interval
     RETURNING claim_token`,
    [eventId, claimToken, EVENT_CLAIM_STALE_AFTER],
  );
  return result.rows[0]?.claim_token === claimToken ? claimToken : null;
}

export async function completeStripeWebhookEvent(eventId: string, claimToken: string): Promise<void> {
  const { pool } = getDb();
  await pool.query(
    `UPDATE stripe_webhook_events
        SET status = 'completed', completed_at = NOW()
      WHERE event_id = $1 AND claim_token = $2 AND status = 'processing'`,
    [eventId, claimToken],
  );
}

export async function releaseStripeWebhookEvent(eventId: string, claimToken: string): Promise<void> {
  const { pool } = getDb();
  await pool.query(
    `DELETE FROM stripe_webhook_events WHERE event_id = $1 AND claim_token = $2 AND status = 'processing'`,
    [eventId, claimToken],
  );
}

export function registerWebhookRoutes(app: FastifyInstance, stripe: Stripe | null, tenants: Map<string, TenantState>): void {
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
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
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
          req.log.error({ err }, 'Stripe signature verification failed');
          return res.code(400).send({ success: false, error: 'Invalid signature' });
        }
      }

      const claimToken = await claimStripeWebhookEvent(event.id);
      if (!claimToken) {
        req.log.info({ eventId: event.id }, 'Ignoring replayed Stripe webhook event');
        return res.send({ received: true });
      }

      try {
        // Handle invoice.payment_succeeded
        if (event.type === 'invoice.payment_succeeded') {
          await handleInvoicePaymentSucceeded(event, req, tenants);
        }

        if (event.type === 'checkout.session.completed') {
          req.log.info(
            { eventId: event.id, eventType: event.type },
            'Acknowledging checkout event without mutation; onboarding owns provisioning',
          );
        }

      // Handle invoice.payment_failed
        if (event.type === 'invoice.payment_failed') {
          await handleInvoicePaymentFailed(event, req, tenants);
        }

      // Handle customer.subscription.deleted
        if (event.type === 'customer.subscription.deleted') {
          await handleSubscriptionDeleted(event, req, tenants);
        }

      // Handle customer.subscription.updated
        if (event.type === 'customer.subscription.updated') {
          await handleSubscriptionUpdated(event, req, tenants);
        }
        await completeStripeWebhookEvent(event.id, claimToken);
        return res.send({ received: true });
      } catch (error) {
        await releaseStripeWebhookEvent(event.id, claimToken);
        throw error;
      }
    } catch (error) {
      performanceMonitor.end(perfId);
      req.log.error({ error }, 'Webhook processing error');
      return sendErrorResponse(res, error instanceof Error ? error : new Error(String(error)));
    }
  });
}

interface StripeLifecycleMutation {
  status: ReturnType<typeof normalizeSubscriptionStatus>;
  active: boolean;
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  clearStripeSubscriptionId?: boolean;
  expiresAt?: Date | null;
  graceUntil: Date | null;
}

interface AppliedStripeLifecycle {
  tenantId: string;
  applied: boolean;
}

/**
 * Locks the tenant row and advances both its lifecycle and Stripe ordering
 * cursor atomically. Stripe timestamps have one-second precision, so event ID
 * provides a stable total order for distinct events created in the same second.
 */
export async function applyStripeLifecycleMutation(
  event: Pick<Stripe.Event, 'id' | 'created'>,
  mutation: StripeLifecycleMutation,
): Promise<AppliedStripeLifecycle | null> {
  if (!event.id || !Number.isSafeInteger(event.created) || event.created < 0) {
    throw new Error('Stripe lifecycle event has invalid ordering metadata');
  }

  return withTransaction(async (client) => {
    const lookup = mutation.stripeSubscriptionId
      ? await client.query(
        `SELECT id, stripe_event_created, stripe_event_id
           FROM tenants
          WHERE stripe_subscription_id = $1 OR stripe_customer_id = $2
          ORDER BY CASE WHEN stripe_subscription_id = $1 THEN 0 ELSE 1 END
          LIMIT 1 FOR UPDATE`,
        [mutation.stripeSubscriptionId, mutation.stripeCustomerId],
      )
      : await client.query(
        `SELECT id, stripe_event_created, stripe_event_id
           FROM tenants WHERE stripe_customer_id = $1 LIMIT 1 FOR UPDATE`,
        [mutation.stripeCustomerId],
      );

    if (lookup.rows.length === 0) return null;
    const row = lookup.rows[0] as {
      id: string;
      stripe_event_created: string | number | null;
      stripe_event_id: string | null;
    };
    const previousCreated = row.stripe_event_created === null ? null : Number(row.stripe_event_created);
    const isStale = previousCreated !== null && (
      event.created < previousCreated
      || (event.created === previousCreated && event.id <= (row.stripe_event_id || ''))
    );
    if (isStale) return { tenantId: row.id, applied: false };

    await client.query(
      `UPDATE tenants
          SET status = $1,
              active = $2,
              expires_at = CASE WHEN $3 THEN $4 ELSE expires_at END,
              grace_until = $5,
              stripe_subscription_id = CASE WHEN $6 THEN $7 ELSE stripe_subscription_id END,
              stripe_event_created = $8,
              stripe_event_id = $9
        WHERE id = $10`,
      [
        mutation.status,
        mutation.active,
        mutation.expiresAt !== undefined,
        mutation.expiresAt ?? null,
        mutation.graceUntil,
        mutation.stripeSubscriptionId !== undefined || mutation.clearStripeSubscriptionId === true,
        mutation.clearStripeSubscriptionId ? null : mutation.stripeSubscriptionId ?? null,
        event.created,
        event.id,
        row.id,
      ],
    );
    return { tenantId: row.id, applied: true };
  });
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

async function handleInvoicePaymentSucceeded(
  event: Stripe.Event,
  req: FastifyRequest,
  tenants: Map<string, TenantState>
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || '';
  
  if (!stripeCustomerId) {
    req.log.warn('No customer ID in invoice.payment_succeeded event');
    return;
  }

  const expiresAt = invoicePeriodEnd(invoice);
  const stripeSubscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : undefined;
  const result = await applyStripeLifecycleMutation(event, {
    status: normalizeSubscriptionStatus('active'),
    active: true,
    stripeCustomerId,
    stripeSubscriptionId,
    expiresAt,
    graceUntil: null,
  });
  if (!result) {
    req.log.warn({ stripeCustomerId }, 'Tenant not found for Stripe customer in invoice.payment_succeeded');
    return;
  }
  if (!result.applied) {
    req.log.info({ eventId: event.id, tenantId: result.tenantId }, 'Ignoring stale Stripe lifecycle event');
    return;
  }
  updateCachedTenant(tenants, result.tenantId, true, null, true);
  req.log.info({ tenantId: result.tenantId, stripeCustomerId, expiresAt }, 'Invoice payment succeeded, tenant activated and expiration updated');
}

async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  req: FastifyRequest,
  tenants: Map<string, TenantState>
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || '';
  const stripeSubscriptionId = invoice.subscription as string | undefined;
  
  if (!stripeCustomerId) {
    req.log.warn('No customer ID in invoice.payment_failed event');
    return;
  }

  const graceDays = parseInt(process.env.GRACE_DAYS || '7', 10);
  const graceUntil = new Date();
  graceUntil.setDate(graceUntil.getDate() + graceDays);
  const result = await applyStripeLifecycleMutation(event, {
    status: normalizeSubscriptionStatus('past_due'),
    active: false,
    stripeCustomerId,
    stripeSubscriptionId,
    graceUntil,
  });
  if (!result) {
    req.log.warn({ stripeCustomerId }, 'Tenant not found for Stripe customer in invoice.payment_failed');
    return;
  }
  if (!result.applied) return;
  updateCachedTenant(tenants, result.tenantId, false, graceUntil);
  req.log.warn({ tenantId: result.tenantId, graceUntil }, 'Payment failed - entered grace period');
  const email = invoice.customer_email || process.env.NOTIFY_FALLBACK_EMAIL || '';
  if (email) {
    await sendEmailNotice(
      email,
      'Sinna: Payment failed, grace period started',
      `Your subscription payment failed. You have a ${graceDays}-day grace period.`
    );
  }
}

async function handleSubscriptionDeleted(
  event: Stripe.Event,
  req: FastifyRequest,
  tenants: Map<string, TenantState>
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || '';
  
  if (!stripeSubscriptionId) {
    req.log.warn('No subscription ID in customer.subscription.deleted event');
    return;
  }

  const authoritativeEnd = subscription.ended_at
    || subscription.canceled_at
    || subscription.current_period_end;
  const result = await applyStripeLifecycleMutation(event, {
    status: normalizeSubscriptionStatus('canceled'),
    active: false,
    stripeCustomerId,
    stripeSubscriptionId,
    clearStripeSubscriptionId: true,
    expiresAt: authoritativeEnd ? new Date(authoritativeEnd * 1000) : undefined,
    graceUntil: null,
  });
  if (!result) {
    req.log.warn({ stripeSubscriptionId, stripeCustomerId }, 'Tenant not found for Stripe subscription in customer.subscription.deleted');
    return;
  }
  if (!result.applied) return;
  updateCachedTenant(tenants, result.tenantId, false, null);
  req.log.warn({ tenantId: result.tenantId, stripeSubscriptionId }, 'Subscription deleted - tenant deactivated and marked as expired');
  
  // Send notification email - get email from customer if available
  // Note: We may need to fetch customer details from Stripe if email is needed
  // For now, use fallback email or skip if not critical
  const email = process.env.NOTIFY_FALLBACK_EMAIL || '';
  if (email) {
    await sendEmailNotice(
      email,
      'Sinna: Subscription Cancelled',
      `Subscription ${stripeSubscriptionId} has been cancelled. Tenant ${result.tenantId} deactivated.`
    );
  }
}

async function handleSubscriptionUpdated(
  event: Stripe.Event,
  req: FastifyRequest,
  tenants: Map<string, TenantState>
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || '';
  const status = subscription.status;
  
  if (!stripeSubscriptionId) {
    req.log.warn('No subscription ID in customer.subscription.updated event');
    return;
  }

  if (!stripeCustomerId) {
    req.log.warn('No subscription or customer ID in customer.subscription.updated event');
    return;
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
    expiresAt: periodEnd ? new Date(periodEnd * 1000) : undefined,
    graceUntil: null,
  });
  if (!result) {
    req.log.warn({ stripeSubscriptionId, stripeCustomerId }, 'Tenant not found for Stripe subscription in customer.subscription.updated');
    return;
  }
  if (!result.applied) return;
  updateCachedTenant(tenants, result.tenantId, isActive, null);
  req.log.info({ tenantId: result.tenantId, stripeSubscriptionId, status }, 'Subscription updated - tenant status changed');
  
  // Send notification for status changes
  // Note: To get customer email, we would need to fetch customer from Stripe
  // For now, log the status change - email notifications can be handled via Stripe's built-in emails
  if (status === 'past_due' || status === 'unpaid') {
    req.log.warn({ tenantId: result.tenantId, stripeSubscriptionId, status }, 'Subscription status issue - tenant may need attention');
    // Stripe typically sends its own emails for payment issues, so we don't duplicate here
  }
}

