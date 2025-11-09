import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { getDb, seedTenantAndApiKey } from '../lib/db';
import { sendEmailNotice } from '../lib/email';
import { sendErrorResponse, ErrorCodes } from '../lib/errors';
import { AuthenticatedRequest, TenantState } from '../types';
import { performanceMonitor } from '../lib/logger';

export function registerWebhookRoutes(app: FastifyInstance, stripe: Stripe | null, tenants: Map<string, TenantState>): void {
  app.post('/webhooks/stripe', {
    config: { rawBody: true },
    schema: {
      description: 'Stripe webhook endpoint for subscription events',
      tags: ['Webhooks'],
      hide: true, // Webhook endpoint, hide from public docs
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
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
      
      const isTesting = process.env.STRIPE_TESTING === 'true' || process.env.NODE_ENV === 'development';
      
      if (!stripe || !webhookSecret) {
        if (isTesting) {
          req.log.warn('Testing mode: Processing webhook without Stripe signature verification');
        } else {
          return res.code(503).send({ success: false, error: ErrorCodes.STRIPE_UNCONFIGURED });
        }
      }
      
      const rawBody = (req as AuthenticatedRequest).rawBody;
      if (!rawBody) {
        return res.code(400).send({ success: false, error: 'missing_body' });
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
          event = stripe!.webhooks.constructEvent(rawBody, sig, webhookSecret);
        } catch (err) {
          req.log.error({ err }, 'Stripe signature verification failed');
          return res.code(400).send({ success: false, error: 'Invalid signature' });
        }
      }

      // Handle invoice.payment_succeeded
      if (event.type === 'invoice.payment_succeeded') {
        await handleInvoicePaymentSucceeded(event, req, tenants);
      }

      // Handle checkout.session.completed
      if (event.type === 'checkout.session.completed') {
        req.log.info({ eventId: event.id, eventType: event.type }, 'Received checkout.session.completed webhook');
        await handleCheckoutSessionCompleted(event, req, tenants);
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

      performanceMonitor.end(perfId);
      res.send({ received: true });
    } catch (error) {
      performanceMonitor.end(perfId);
      req.log.error({ error }, 'Webhook processing error');
      sendErrorResponse(res, error instanceof Error ? error : new Error(String(error)));
    }
  });
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

  const { pool } = getDb();
  const { rows } = await pool.query(
    'SELECT id FROM tenants WHERE stripe_customer_id = $1',
    [stripeCustomerId]
  );
  
  if (rows.length === 0) {
    req.log.warn({ stripeCustomerId }, 'Tenant not found for Stripe customer in invoice.payment_succeeded');
    return;
  }
  
  const tenantId = rows[0].id as string;
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
  
  req.log.info({ tenantId, stripeCustomerId }, 'Invoice payment succeeded, tenant activated');
}

async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  req: FastifyRequest,
  tenants: Map<string, TenantState>
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const email = session.customer_details?.email;
  
  if (!email) {
    req.log.warn('No email in checkout.session.completed event');
    return;
  }

  try {
    const { createApiKey } = await import('../utils/keys');
    const { apiKey, hashed } = createApiKey();

    const { tenantId } = await seedTenantAndApiKey({
      tenantName: email,
      plan: 'standard',
      apiKeyHash: hashed,
    });

    const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || '';
    const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || '';
    
    if (stripeCustomerId || stripeSubscriptionId) {
      const { pool } = getDb();
      if (stripeCustomerId && stripeSubscriptionId) {
        await pool.query(
          'UPDATE tenants SET stripe_customer_id = $1, stripe_subscription_id = $2 WHERE id = $3',
          [stripeCustomerId, stripeSubscriptionId, tenantId]
        );
      } else if (stripeCustomerId) {
        await pool.query(
          'UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2',
          [stripeCustomerId, tenantId]
        );
      } else if (stripeSubscriptionId) {
        await pool.query(
          'UPDATE tenants SET stripe_subscription_id = $1 WHERE id = $2',
          [stripeSubscriptionId, tenantId]
        );
      }
    }

    const state = tenants.get(tenantId) || {
      active: false,
      usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
    } as TenantState;
    
    state.active = true;
    state.graceUntil = undefined;
    tenants.set(tenantId, state);

    req.log.info({ email, tenantId, apiKey }, 'New subscription created, API key generated');
    
    // Send email with API key
    try {
      const { sendApiKeyEmail } = await import('../utils/email');
      await sendApiKeyEmail(email, apiKey);
      req.log.info({ email }, 'API key email sent successfully');
    } catch (emailError) {
      // Log the API key prominently if email fails so it can be retrieved from logs
      req.log.error({ 
        email, 
        apiKey, 
        error: emailError instanceof Error ? emailError.message : String(emailError) 
      }, 'CRITICAL: Failed to send API key email - API key logged below');
      req.log.warn({ apiKey, email }, 'API KEY FOR MANUAL RETRIEVAL (email failed)');
    }
  } catch (error) {
    req.log.error({ error, email }, 'Failed to create tenant and API key for new subscription');
    throw error;
  }
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

  const { pool } = getDb();
  const { rows } = await pool.query(
    'SELECT id FROM tenants WHERE stripe_customer_id = $1',
    [stripeCustomerId]
  );
  
  if (rows.length === 0) {
    req.log.warn({ stripeCustomerId }, 'Tenant not found for Stripe customer in invoice.payment_failed');
    return;
  }
  
  const tenantId = rows[0].id as string;
  
  // Update subscription ID if provided
  if (stripeSubscriptionId) {
    await pool.query(
      'UPDATE tenants SET stripe_subscription_id = $1 WHERE id = $2',
      [stripeSubscriptionId, tenantId]
    );
  }
  
  const state = tenants.get(tenantId) || {
    active: false,
    usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
  } as TenantState;
  
  state.active = false;
  const graceDays = parseInt(process.env.GRACE_DAYS || '7', 10);
  state.graceUntil = Date.now() + graceDays * 24 * 3600 * 1000;
  tenants.set(tenantId, state);
  
  req.log.warn({ tenantId }, 'Payment failed - entered grace period');
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

  const { pool } = getDb();
  
  // Find tenant by subscription ID first, fallback to customer ID
  let rows: Array<{ id: string }>;
  if (stripeSubscriptionId) {
    const result = await pool.query(
      'SELECT id FROM tenants WHERE stripe_subscription_id = $1',
      [stripeSubscriptionId]
    );
    rows = result.rows;
    
    // Fallback to customer ID if not found by subscription ID
    if (rows.length === 0 && stripeCustomerId) {
      const fallbackResult = await pool.query(
        'SELECT id FROM tenants WHERE stripe_customer_id = $1',
        [stripeCustomerId]
      );
      rows = fallbackResult.rows;
    }
  } else if (stripeCustomerId) {
    const result = await pool.query(
      'SELECT id FROM tenants WHERE stripe_customer_id = $1',
      [stripeCustomerId]
    );
    rows = result.rows;
  } else {
    req.log.warn('No subscription or customer ID in customer.subscription.deleted event');
    return;
  }
  
  if (rows.length === 0) {
    req.log.warn({ stripeSubscriptionId, stripeCustomerId }, 'Tenant not found for Stripe subscription in customer.subscription.deleted');
    return;
  }
  
  const tenantId = rows[0].id as string;
  
  // Deactivate tenant and clear subscription ID
  await pool.query(
    'UPDATE tenants SET active = false, stripe_subscription_id = NULL WHERE id = $1',
    [tenantId]
  );
  
  const state = tenants.get(tenantId) || {
    active: false,
    usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
  } as TenantState;
  
  state.active = false;
  state.graceUntil = undefined;
  tenants.set(tenantId, state);
  
  req.log.warn({ tenantId, stripeSubscriptionId }, 'Subscription deleted - tenant deactivated');
  
  // Send notification email - get email from customer if available
  // Note: We may need to fetch customer details from Stripe if email is needed
  // For now, use fallback email or skip if not critical
  const email = process.env.NOTIFY_FALLBACK_EMAIL || '';
  if (email) {
    await sendEmailNotice(
      email,
      'Sinna: Subscription Cancelled',
      `Subscription ${stripeSubscriptionId} has been cancelled. Tenant ${tenantId} deactivated.`
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

  const { pool } = getDb();
  
  // Find tenant by subscription ID first, fallback to customer ID
  let rows: Array<{ id: string }>;
  if (stripeSubscriptionId) {
    const result = await pool.query(
      'SELECT id FROM tenants WHERE stripe_subscription_id = $1',
      [stripeSubscriptionId]
    );
    rows = result.rows;
    
    // Fallback to customer ID if not found by subscription ID
    if (rows.length === 0 && stripeCustomerId) {
      const fallbackResult = await pool.query(
        'SELECT id FROM tenants WHERE stripe_customer_id = $1',
        [stripeCustomerId]
      );
      rows = fallbackResult.rows;
      
      // Update subscription ID if found by customer ID
      if (rows.length > 0) {
        await pool.query(
          'UPDATE tenants SET stripe_subscription_id = $1 WHERE id = $2',
          [stripeSubscriptionId, rows[0].id]
        );
      }
    }
  } else if (stripeCustomerId) {
    const result = await pool.query(
      'SELECT id FROM tenants WHERE stripe_customer_id = $1',
      [stripeCustomerId]
    );
    rows = result.rows;
  } else {
    req.log.warn('No subscription or customer ID in customer.subscription.updated event');
    return;
  }
  
  if (rows.length === 0) {
    req.log.warn({ stripeSubscriptionId, stripeCustomerId }, 'Tenant not found for Stripe subscription in customer.subscription.updated');
    return;
  }
  
  const tenantId = rows[0].id as string;
  
  // Update tenant status based on subscription status
  const isActive = status === 'active' || status === 'trialing';
  await pool.query(
    'UPDATE tenants SET active = $1, stripe_subscription_id = $2 WHERE id = $3',
    [isActive, stripeSubscriptionId, tenantId]
  );
  
  const state = tenants.get(tenantId) || {
    active: false,
    usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
  } as TenantState;
  
  state.active = isActive;
  if (!isActive) {
    state.graceUntil = undefined;
  }
  tenants.set(tenantId, state);
  
  req.log.info({ tenantId, stripeSubscriptionId, status }, 'Subscription updated - tenant status changed');
  
  // Send notification for status changes
  // Note: To get customer email, we would need to fetch customer from Stripe
  // For now, log the status change - email notifications can be handled via Stripe's built-in emails
  if (status === 'past_due' || status === 'unpaid') {
    req.log.warn({ tenantId, stripeSubscriptionId, status }, 'Subscription status issue - tenant may need attention');
    // Stripe typically sends its own emails for payment issues, so we don't duplicate here
  }
}

