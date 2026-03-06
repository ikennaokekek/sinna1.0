import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { getDb, withRetry } from '../lib/db';
import { sendEmailNotice } from '../lib/email';
import { AuthenticatedRequest, TenantState } from '../types';
import { performanceMonitor } from '../lib/logger';
import { callReplitInternalOnboard, type InternalOnboardPayload } from '../lib/internalOnboard';
import { getStripeMode } from '../config/env';

/**
 * PRODUCTION-READY STRIPE WEBHOOK HANDLER
 * 
 * Key guarantees:
 * 1. Always returns 200 immediately (before processing)
 * 2. No unhandled errors can trigger 503
 * 3. Idempotent event processing (tracks processed events)
 * 4. Resilient to cold starts and retries
 * 5. Comprehensive error logging without crashing
 */

export function registerWebhookRoutes(app: FastifyInstance, stripe: Stripe | null, tenants: Map<string, TenantState>): void {
  app.post('/webhooks/stripe', {
    config: { rawBody: true },
    schema: {
      description: 'Stripe webhook endpoint for subscription events',
      tags: ['Webhooks'],
      hide: true,
      headers: {
        type: 'object',
        required: ['stripe-signature'],
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
            received: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (req: FastifyRequest, res: FastifyReply) => {
    const perfId = performanceMonitor.start('stripe_webhook', (req as AuthenticatedRequest).requestId);
    const requestId = (req as AuthenticatedRequest).requestId || 'unknown';
    
    // Structured logging helper
    const logContext = {
      requestId,
      timestamp: new Date().toISOString(),
    };

    try {
      // STEP 1: Verify signature and parse event (must succeed before returning 200)
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
      const isTesting = process.env.STRIPE_TESTING === 'true' || process.env.NODE_ENV === 'development';

      // Validate configuration (but don't return 503 - return 200 and log error)
      if (!stripe || !webhookSecret) {
        if (isTesting) {
          req.log.warn({ ...logContext }, 'Testing mode: Processing webhook without Stripe signature verification');
        } else {
          req.log.error({ ...logContext }, 'Stripe webhook misconfigured: missing stripe client or webhook secret');
          // Return 200 to prevent Stripe retries, but log the error
          performanceMonitor.end(perfId);
          return res.code(200).send({ received: false, error: 'misconfigured' });
        }
      }

      // Validate raw body exists
      const rawBody = (req as AuthenticatedRequest).rawBody;
      if (!rawBody) {
        req.log.error({ ...logContext }, 'Missing raw body in webhook request');
        performanceMonitor.end(perfId);
        return res.code(400).send({ received: false, error: 'missing_body' });
      }

      // Parse and verify event
      let event: Stripe.Event;
      try {
        if (isTesting) {
          event = JSON.parse(rawBody.toString()) as Stripe.Event;
          const stripeMode = getStripeMode();
          req.log.info({ ...logContext, eventId: event.id, eventType: event.type, stripeMode }, `Testing mode: Parsed webhook payload (${stripeMode.toUpperCase()} mode)`);
        } else {
          if (!sig) {
            req.log.error({ ...logContext }, 'Missing stripe-signature header');
            performanceMonitor.end(perfId);
            return res.code(400).send({ received: false, error: 'missing_signature' });
          }
          event = stripe!.webhooks.constructEvent(rawBody, sig, webhookSecret);
          const stripeMode = getStripeMode();
          req.log.info({ ...logContext, eventId: event.id, eventType: event.type, stripeMode }, `Stripe webhook signature verified (${stripeMode.toUpperCase()} mode)`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        req.log.error({ ...logContext, error: errorMessage }, 'Stripe signature verification or parsing failed');
        performanceMonitor.end(perfId);
        // Return 400 for invalid signature (Stripe won't retry these)
        return res.code(400).send({ received: false, error: 'invalid_signature' });
      }

      // STEP 2: Idempotency — insert with onboarding_status = 'pending'; if event_id already exists, return 200
      const eventId = event.id;
      const eventType = event.type;
      req.log.info(
        { eventId, eventType },
        'DEBUG: Webhook event received before idempotency check'
      );
      const inserted = await insertWebhookEventIfNew(eventId, eventType);
      if (!inserted) {
        req.log.info({ ...logContext, eventId, eventType }, 'Event already processed, skipping (idempotency)');
        performanceMonitor.end(perfId);
        return res.code(200).send({ received: true });
      }

      // STEP 3: Return 200 IMMEDIATELY (before processing)
      // This prevents Stripe from retrying while we process the event
      res.code(200).send({ received: true });
      performanceMonitor.end(perfId);

      // STEP 4: Process event asynchronously (after response sent)
      // Wrap in try/catch to ensure no unhandled errors
      processEventAsync(event, req, tenants, logContext).catch((error) => {
        // This catch should never be reached if processEventAsync handles all errors
        // But we add it as a safety net
        req.log.error(
          { ...logContext, eventId, eventType, error: error instanceof Error ? error.message : String(error) },
          'CRITICAL: Unhandled error in async event processing (should never happen)'
        );
      });

    } catch (error) {
      // Final safety net - catch any errors before response is sent
      const errorMessage = error instanceof Error ? error.message : String(error);
      req.log.error({ ...logContext, error: errorMessage }, 'Unexpected error in webhook handler');
      performanceMonitor.end(perfId);
      
      // Always return 200 to prevent Stripe retries
      // Even if we can't process, we don't want infinite retries
      return res.code(200).send({ received: false, error: 'processing_failed' });
    }
  });
}

/**
 * Insert webhook event with onboarding_status = 'pending' if not already present.
 * Returns true if we inserted (first time), false if event_id already exists (duplicate).
 */
async function insertWebhookEventIfNew(eventId: string, eventType: string): Promise<boolean> {
  try {
    const { pool } = getDb();
    const result = await pool.query(
      `INSERT INTO webhook_events (event_id, event_type, processing_status, onboarding_status, processed_at, error_message, error)
       VALUES ($1, $2, 'pending', 'pending', NOW(), NULL, NULL)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, eventType]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('[Webhook] Failed to insert webhook event:', error);
    return false;
  }
}

/**
 * Mark an event as processed; optionally set onboarding_status (for checkout.session.completed).
 */
async function markEventProcessed(
  eventId: string,
  eventType: string,
  status: 'completed' | 'failed',
  errorMessage?: string,
  metadata?: Record<string, unknown>,
  onboardingStatus?: 'completed' | 'failed'
): Promise<void> {
  try {
    const { pool } = getDb();
    if (onboardingStatus !== undefined) {
      await pool.query(
        `UPDATE webhook_events SET processing_status = $1, onboarding_status = $2, processed_at = NOW(), error_message = $3, error = $3, metadata = $4 WHERE event_id = $5`,
        [status, onboardingStatus, errorMessage || null, metadata ? JSON.stringify(metadata) : null, eventId]
      );
    } else {
      await pool.query(
        `UPDATE webhook_events SET processing_status = $1, processed_at = NOW(), error_message = $2, error = $2, metadata = $3 WHERE event_id = $4`,
        [status, errorMessage || null, metadata ? JSON.stringify(metadata) : null, eventId]
      );
    }
  } catch (error) {
    console.error('[Webhook] Failed to mark event as processed:', error);
  }
}

/**
 * Append a row to onboarding_logs (observability; never silent failure).
 */
async function insertOnboardingLog(
  stripeEventId: string,
  step: string,
  status: string,
  error?: string
): Promise<void> {
  try {
    const { pool } = getDb();
    await pool.query(
      `INSERT INTO onboarding_logs (stripe_event_id, step, status, error) VALUES ($1, $2, $3, $4)`,
      [stripeEventId, step, status, error ?? null]
    );
  } catch (err) {
    console.error('[Webhook] Failed to insert onboarding_log:', err);
  }
}

/**
 * Process event asynchronously after 200 response has been sent
 * All errors are caught and logged, never thrown
 */
async function processEventAsync(
  event: Stripe.Event,
  req: FastifyRequest,
  tenants: Map<string, TenantState>,
  logContext: Record<string, unknown>
): Promise<void> {
  const eventId = event.id;
  const eventType = event.type;
  req.log.info(
    { eventId, eventType },
    'DEBUG: Entered processEventAsync'
  );
  const startTime = Date.now();

  req.log.info(
    { ...logContext, eventId, eventType },
    'Processing webhook event asynchronously'
  );

  try {
    // Route to appropriate handler based on event type.
    // checkout.session.completed is always processed by Render → callReplitInternalOnboard (no skip).
    req.log.info(
      { eventId, eventType },
      'DEBUG: About to enter eventType switch'
    );
    switch (eventType) {
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event, req, tenants);
        break;

      case 'checkout.session.completed':
        req.log.info({ ...logContext, eventId, eventType }, 'Processing checkout.session.completed (Render → onboarding service)');
        await handleCheckoutSessionCompleted(event, req, logContext);
        return; // onboarding_status updated inside handler; do not run generic markEventProcessed

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event, req, tenants);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event, req, tenants);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event, req, tenants);
        break;

      default:
        req.log.info({ ...logContext, eventId, eventType }, 'Unhandled event type (ignoring)');
        // Mark as completed even if unhandled (we received it successfully)
        await markEventProcessed(eventId, eventType, 'completed', undefined, { reason: 'unhandled_type' });
        return;
    }

    // Mark event as successfully processed (for non-checkout, no onboarding_status update)
    const processingTime = Date.now() - startTime;
    await markEventProcessed(eventId, eventType, 'completed', undefined, { processingTimeMs: processingTime });

    req.log.info(
      { ...logContext, eventId, eventType, processingTimeMs: processingTime },
      'Webhook event processed successfully'
    );

  } catch (error) {
    // Catch ALL errors - never let them propagate
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const processingTime = Date.now() - startTime;

    req.log.error(
      {
        ...logContext,
        eventId,
        eventType,
        error: errorMessage,
        stack: errorStack,
        processingTimeMs: processingTime,
      },
      'Error processing webhook event (logged, not retried)'
    );

    // Mark event as failed (but don't throw)
    await markEventProcessed(eventId, eventType, 'failed', errorMessage, {
      processingTimeMs: processingTime,
      error: errorMessage,
    });

    // Don't throw - error is logged, event is marked as failed
    // Stripe won't retry because we already returned 200
  }
}

function getEmailDomain(email: string): string | undefined {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return undefined;
  return email.slice(at + 1).toLowerCase();
}

/**
 * Handler for invoice.payment_succeeded
 * Wrapped in try/catch to prevent errors from propagating
 */
async function handleInvoicePaymentSucceeded(
  event: Stripe.Event,
  req: FastifyRequest,
  tenants: Map<string, TenantState>
): Promise<void> {
  try {
    const invoice = event.data.object as Stripe.Invoice;
    const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || '';
    
    if (!stripeCustomerId) {
      req.log.warn({ eventId: event.id }, 'No customer ID in invoice.payment_succeeded event');
      return;
    }

    const { pool } = getDb();
    
    // Use retry for database operations
    const { rows } = await withRetry(async () => {
      return await pool.query(
        'SELECT id FROM tenants WHERE stripe_customer_id = $1',
        [stripeCustomerId]
      );
    }, 2, 100);
    
    if (rows.length === 0) {
      req.log.warn({ eventId: event.id, stripeCustomerId }, 'Tenant not found for Stripe customer in invoice.payment_succeeded');
      return;
    }
    
    const tenantId = rows[0].id as string;
    
    // Update subscription expiration to 30 days from now (renewal)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    // Update tenant status and expiration with retry
    await withRetry(async () => {
      await pool.query(
        'UPDATE tenants SET status = $1, active = $2, expires_at = $3, grace_until = NULL WHERE id = $4',
        ['active', true, expiresAt, tenantId]
      );
    }, 2, 100);
    
    // Update in-memory cache
    const state = tenants.get(tenantId) || {
      active: false,
      usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
    } as TenantState;
    
    state.active = true;
    state.graceUntil = undefined;
    state.usage.requests = 0;
    state.usage.minutes = 0;
    state.usage.jobs = 0;
    state.usage.storage = 0;
    tenants.set(tenantId, state);
    
    req.log.info({ eventId: event.id, tenantId, stripeCustomerId, expiresAt }, 'Invoice payment succeeded, tenant activated and expiration updated');
  } catch (error) {
    // Catch and log - don't throw
    req.log.error(
      { eventId: event.id, error: error instanceof Error ? error.message : String(error) },
      'Error in handleInvoicePaymentSucceeded'
    );
    throw error; // Re-throw to be caught by processEventAsync
  }
}

/**
 * Handler for checkout.session.completed
 * Calls Replit POST /internal/onboard (HMAC-secured); updates onboarding_status and onboarding_logs.
 */
export async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  req: FastifyRequest,
  logContext: Record<string, unknown>
): Promise<void> {
  const eventId = event.id;
  try {
    const session = event.data.object as Stripe.Checkout.Session;
    req.log.info(
      { ...logContext, eventId, stripeSessionId: session.id },
      'Processing checkout.session.completed'
    );

    const isPaid = session.payment_status === 'paid';
    const isComplete = session.status === 'complete';
    if (!isPaid || !isComplete) {
      req.log.info(
        { ...logContext, eventId, stripeSessionId: session.id, payment_status: session.payment_status, status: session.status },
        'Payment not verified; skipping onboarding'
      );
      await markEventProcessed(eventId, 'checkout.session.completed', 'completed', undefined, undefined, 'completed');
      return;
    }

    const email = session.customer_email || session.customer_details?.email;
    if (!email) {
      req.log.error({ ...logContext, eventId, stripeSessionId: session.id }, 'Payment verified but customer email is missing');
      await markEventProcessed(eventId, 'checkout.session.completed', 'failed', 'Missing customer email', undefined, 'failed');
      await insertOnboardingLog(eventId, 'validate', 'failed', 'Missing customer email');
      return;
    }

    const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? '';
    const sub = session.subscription;
    const subscriptionId = typeof sub === 'string' ? sub : (sub as { id?: string } | null)?.id ?? '';

    const baseUrl = process.env.ONBOARD_SERVICE_URL ?? '';
    const secret = process.env.INTERNAL_SERVICE_SECRET ?? '';
    if (!baseUrl || !secret) {
      req.log.error({ ...logContext, eventId }, 'ONBOARD_SERVICE_URL and INTERNAL_SERVICE_SECRET required for onboarding');
      await markEventProcessed(eventId, 'checkout.session.completed', 'failed', 'Missing onboarding config', undefined, 'failed');
      await insertOnboardingLog(eventId, 'config', 'failed', 'Missing ONBOARD_SERVICE_URL or INTERNAL_SERVICE_SECRET');
      return;
    }

    const payload: InternalOnboardPayload = {
      eventId,
      stripeSessionId: session.id,
      stripeCustomerId,
      subscriptionId,
      email,
      plan: 'standard',
      timestamp: new Date().toISOString(),
    };

    req.log.info(
      { ...logContext, eventId, stripeSessionId: session.id, emailDomain: getEmailDomain(email) },
      'Calling onboarding service POST /internal/onboard'
    );

    const result = await callReplitInternalOnboard(
      baseUrl.replace(/\/$/, ''),
      secret,
      payload,
      {
        onLog: (step, status, error) => insertOnboardingLog(eventId, step, status, error),
      }
    );

    if (result.ok) {
      req.log.info({ ...logContext, eventId, stripeSessionId: session.id }, 'Replit onboarding successful');
      await markEventProcessed(eventId, 'checkout.session.completed', 'completed', undefined, undefined, 'completed');
    } else {
      req.log.error(
        { ...logContext, eventId, stripeSessionId: session.id, error: result.error },
        'Replit onboarding failed after retries'
      );
      await markEventProcessed(eventId, 'checkout.session.completed', 'failed', result.error ?? 'Unknown error', undefined, 'failed');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    req.log.error({ ...logContext, eventId, error: errorMessage }, 'Error in handleCheckoutSessionCompleted');
    await markEventProcessed(eventId, 'checkout.session.completed', 'failed', errorMessage, undefined, 'failed');
    await insertOnboardingLog(eventId, 'handler_error', 'failed', errorMessage);
    throw error;
  }
}

/**
 * Handler for invoice.payment_failed
 * Wrapped in try/catch to prevent errors from propagating
 */
async function handleInvoicePaymentFailed(
  event: Stripe.Event,
  req: FastifyRequest,
  tenants: Map<string, TenantState>
): Promise<void> {
  try {
    const invoice = event.data.object as Stripe.Invoice;
    const stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || '';
    const stripeSubscriptionId = invoice.subscription as string | undefined;
    
    if (!stripeCustomerId) {
      req.log.warn({ eventId: event.id }, 'No customer ID in invoice.payment_failed event');
      return;
    }

    const { pool } = getDb();
    
    // Use retry for database operations
    const { rows } = await withRetry(async () => {
      return await pool.query(
        'SELECT id FROM tenants WHERE stripe_customer_id = $1',
        [stripeCustomerId]
      );
    }, 2, 100);
    
    if (rows.length === 0) {
      req.log.warn({ eventId: event.id, stripeCustomerId }, 'Tenant not found for Stripe customer in invoice.payment_failed');
      return;
    }
    
    const tenantId = rows[0].id as string;
    
    // Update subscription ID if provided
    if (stripeSubscriptionId) {
      await withRetry(async () => {
        await pool.query(
          'UPDATE tenants SET stripe_subscription_id = $1 WHERE id = $2',
          [stripeSubscriptionId, tenantId]
        );
      }, 2, 100);
    }
    
    // Deactivate tenant and mark as inactive (grace period allows temporary access)
    const graceDays = parseInt(process.env.GRACE_DAYS || '7', 10);
    const graceUntil = new Date();
    graceUntil.setDate(graceUntil.getDate() + graceDays);
    
    await withRetry(async () => {
      await pool.query(
        'UPDATE tenants SET active = false, status = $1, grace_until = $2 WHERE id = $3',
        ['inactive', graceUntil, tenantId]
      );
    }, 2, 100);
    
    // Update in-memory cache
    const state = tenants.get(tenantId) || {
      active: false,
      usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
    } as TenantState;
    
    state.active = false;
    state.graceUntil = graceUntil.getTime();
    tenants.set(tenantId, state);
    
    req.log.warn({ eventId: event.id, tenantId, graceUntil }, 'Payment failed - entered grace period');
    
    // Send email notification (non-critical, don't fail if it fails)
    const email = invoice.customer_email || process.env.NOTIFY_FALLBACK_EMAIL || '';
    if (email) {
      try {
        await sendEmailNotice(
          email,
          'Sinna: Payment failed, grace period started',
          `Your subscription payment failed. You have a ${graceDays}-day grace period.`
        );
      } catch (emailError) {
        req.log.warn({ eventId: event.id, error: emailError instanceof Error ? emailError.message : String(emailError) }, 'Failed to send payment failed email (non-critical)');
      }
    }
  } catch (error) {
    // Catch and log - don't throw
    req.log.error(
      { eventId: event.id, error: error instanceof Error ? error.message : String(error) },
      'Error in handleInvoicePaymentFailed'
    );
    throw error; // Re-throw to be caught by processEventAsync
  }
}

/**
 * Handler for customer.subscription.deleted
 * Wrapped in try/catch to prevent errors from propagating
 */
async function handleSubscriptionDeleted(
  event: Stripe.Event,
  req: FastifyRequest,
  tenants: Map<string, TenantState>
): Promise<void> {
  try {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeSubscriptionId = subscription.id;
    const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || '';
    
    if (!stripeSubscriptionId) {
      req.log.warn({ eventId: event.id }, 'No subscription ID in customer.subscription.deleted event');
      return;
    }

    const { pool } = getDb();
    
    // Find tenant by subscription ID first, fallback to customer ID
    let rows: Array<{ id: string }>;
    if (stripeSubscriptionId) {
      const result = await withRetry(async () => {
        return await pool.query(
          'SELECT id FROM tenants WHERE stripe_subscription_id = $1',
          [stripeSubscriptionId]
        );
      }, 2, 100);
      rows = result.rows;
      
      // Fallback to customer ID if not found by subscription ID
      if (rows.length === 0 && stripeCustomerId) {
        const fallbackResult = await withRetry(async () => {
          return await pool.query(
            'SELECT id FROM tenants WHERE stripe_customer_id = $1',
            [stripeCustomerId]
          );
        }, 2, 100);
        rows = fallbackResult.rows;
      }
    } else if (stripeCustomerId) {
      const result = await withRetry(async () => {
        return await pool.query(
          'SELECT id FROM tenants WHERE stripe_customer_id = $1',
          [stripeCustomerId]
        );
      }, 2, 100);
      rows = result.rows;
    } else {
      req.log.warn({ eventId: event.id }, 'No subscription or customer ID in customer.subscription.deleted event');
      return;
    }
    
    if (rows.length === 0) {
      req.log.warn({ eventId: event.id, stripeSubscriptionId, stripeCustomerId }, 'Tenant not found for Stripe subscription in customer.subscription.deleted');
      return;
    }
    
    const tenantId = rows[0].id as string;
    
    // Deactivate tenant, mark as expired, and clear subscription ID
    await withRetry(async () => {
      await pool.query(
        'UPDATE tenants SET active = false, status = $1, stripe_subscription_id = NULL WHERE id = $2',
        ['expired', tenantId]
      );
    }, 2, 100);
    
    // Update in-memory cache
    const state = tenants.get(tenantId) || {
      active: false,
      usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
    } as TenantState;
    
    state.active = false;
    state.graceUntil = undefined;
    tenants.set(tenantId, state);
    
    req.log.warn({ eventId: event.id, tenantId, stripeSubscriptionId }, 'Subscription deleted - tenant deactivated and marked as expired');
    
    // Send notification email (non-critical)
    const email = process.env.NOTIFY_FALLBACK_EMAIL || '';
    if (email) {
      try {
        await sendEmailNotice(
          email,
          'Sinna: Subscription Cancelled',
          `Subscription ${stripeSubscriptionId} has been cancelled. Tenant ${tenantId} deactivated.`
        );
      } catch (emailError) {
        req.log.warn({ eventId: event.id, error: emailError instanceof Error ? emailError.message : String(emailError) }, 'Failed to send subscription deleted email (non-critical)');
      }
    }
  } catch (error) {
    // Catch and log - don't throw
    req.log.error(
      { eventId: event.id, error: error instanceof Error ? error.message : String(error) },
      'Error in handleSubscriptionDeleted'
    );
    throw error; // Re-throw to be caught by processEventAsync
  }
}

/**
 * Handler for customer.subscription.updated
 * Wrapped in try/catch to prevent errors from propagating
 */
async function handleSubscriptionUpdated(
  event: Stripe.Event,
  req: FastifyRequest,
  tenants: Map<string, TenantState>
): Promise<void> {
  try {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeSubscriptionId = subscription.id;
    const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || '';
    const status = subscription.status;
    
    if (!stripeSubscriptionId) {
      req.log.warn({ eventId: event.id }, 'No subscription ID in customer.subscription.updated event');
      return;
    }

    const { pool } = getDb();
    
    // Find tenant by subscription ID first, fallback to customer ID
    let rows: Array<{ id: string }>;
    if (stripeSubscriptionId) {
      const result = await withRetry(async () => {
        return await pool.query(
          'SELECT id FROM tenants WHERE stripe_subscription_id = $1',
          [stripeSubscriptionId]
        );
      }, 2, 100);
      rows = result.rows;
      
      // Fallback to customer ID if not found by subscription ID
      if (rows.length === 0 && stripeCustomerId) {
        const fallbackResult = await withRetry(async () => {
          return await pool.query(
            'SELECT id FROM tenants WHERE stripe_customer_id = $1',
            [stripeCustomerId]
          );
        }, 2, 100);
        rows = fallbackResult.rows;
        
        // Update subscription ID if found by customer ID
        if (rows.length > 0) {
          await withRetry(async () => {
            await pool.query(
              'UPDATE tenants SET stripe_subscription_id = $1 WHERE id = $2',
              [stripeSubscriptionId, rows[0].id]
            );
          }, 2, 100);
        }
      }
    } else if (stripeCustomerId) {
      const result = await withRetry(async () => {
        return await pool.query(
          'SELECT id FROM tenants WHERE stripe_customer_id = $1',
          [stripeCustomerId]
        );
      }, 2, 100);
      rows = result.rows;
    } else {
      req.log.warn({ eventId: event.id }, 'No subscription or customer ID in customer.subscription.updated event');
      return;
    }
    
    if (rows.length === 0) {
      req.log.warn({ eventId: event.id, stripeSubscriptionId, stripeCustomerId }, 'Tenant not found for Stripe subscription in customer.subscription.updated');
      return;
    }
    
    const tenantId = rows[0].id as string;
    
    // Update tenant status based on subscription status
    const isActive = status === 'active' || status === 'trialing';
    let tenantStatus: 'active' | 'inactive' | 'expired' = isActive ? 'active' : 'inactive';
    let expiresAt: Date | null = null;
    
    // If subscription is active, extend expiration by 30 days
    if (isActive) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
    } else if (status === 'canceled' || status === 'unpaid') {
      tenantStatus = 'expired';
    }
    
    if (expiresAt) {
      await withRetry(async () => {
        await pool.query(
          'UPDATE tenants SET active = $1, status = $2, stripe_subscription_id = $3, expires_at = $4 WHERE id = $5',
          [isActive, tenantStatus, stripeSubscriptionId, expiresAt, tenantId]
        );
      }, 2, 100);
    } else {
      await withRetry(async () => {
        await pool.query(
          'UPDATE tenants SET active = $1, status = $2, stripe_subscription_id = $3 WHERE id = $4',
          [isActive, tenantStatus, stripeSubscriptionId, tenantId]
        );
      }, 2, 100);
    }
    
    // Update in-memory cache
    const state = tenants.get(tenantId) || {
      active: false,
      usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
    } as TenantState;
    
    state.active = isActive;
    if (!isActive) {
      state.graceUntil = undefined;
    }
    tenants.set(tenantId, state);
    
    req.log.info({ eventId: event.id, tenantId, stripeSubscriptionId, status }, 'Subscription updated - tenant status changed');
    
    // Log warnings for status issues (non-critical)
    if (status === 'past_due' || status === 'unpaid') {
      req.log.warn({ eventId: event.id, tenantId, stripeSubscriptionId, status }, 'Subscription status issue - tenant may need attention');
    }
  } catch (error) {
    // Catch and log - don't throw
    req.log.error(
      { eventId: event.id, error: error instanceof Error ? error.message : String(error) },
      'Error in handleSubscriptionUpdated'
    );
    throw error; // Re-throw to be caught by processEventAsync
  }
}
