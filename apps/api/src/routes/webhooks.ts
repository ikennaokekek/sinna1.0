import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { getDb, seedTenantAndApiKey } from '../lib/db';
import { sendEmailNotice } from '../lib/email';
import { sendErrorResponse, ErrorCodes } from '../lib/errors';
import { AuthenticatedRequest, TenantState } from '../types';
import { performanceMonitor } from '../lib/logger';
import { redisConnection } from '../lib/redis';

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
      // NOTE: This event is now primarily handled by Replit Developer Portal.
      // Replit creates the customer, generates API key, sends email, then syncs to Render via /v1/sync/tenant
      // This handler is kept for backward compatibility but should be deprioritized.
      // In production with Replit, this webhook may not be received by Render.
      if (event.type === 'checkout.session.completed') {
        req.log.info({ 
          eventId: event.id, 
          eventType: event.type,
          note: 'checkout.session.completed is now handled by Replit Developer Portal. This handler is for backward compatibility only.'
        }, 'Received checkout.session.completed webhook (deprioritized - handled by Replit)');
        
        // Only process if explicitly enabled via environment variable
        // This allows gradual migration and fallback if needed
        if (process.env.ENABLE_RENDER_CHECKOUT_HANDLER === 'true') {
          req.log.info('Processing checkout.session.completed (ENABLE_RENDER_CHECKOUT_HANDLER=true)');
          await handleCheckoutSessionCompleted(event, req, tenants);
        } else {
          req.log.info('Skipping checkout.session.completed handler (handled by Replit Developer Portal)');
        }
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
      return res.send({ received: true });
    } catch (error) {
      performanceMonitor.end(perfId);
      req.log.error({ error }, 'Webhook processing error');
      return sendErrorResponse(res, error instanceof Error ? error : new Error(String(error)));
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
  
  // Update subscription expiration to 30 days from now (renewal)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  // Update tenant status and expiration
  await pool.query(
    'UPDATE tenants SET status = $1, active = $2, expires_at = $3, grace_until = NULL WHERE id = $4',
    ['active', true, expiresAt, tenantId]
  );
  
  // Optional: Rotate API key on renewal (uncomment to enable)
  // const { createApiKey } = await import('../utils/keys');
  // const { apiKey: newKey, hashed: newHash } = createApiKey();
  // await pool.query(
  //   'INSERT INTO api_keys (key_hash, tenant_id) VALUES ($1, $2)',
  //   [newHash, tenantId]
  // );
  // const { sendApiKeyEmail } = await import('../utils/email');
  // const tenantEmail = (await pool.query('SELECT name FROM tenants WHERE id = $1', [tenantId])).rows[0]?.name;
  // if (tenantEmail) {
  //   await sendApiKeyEmail(tenantEmail, newKey, { note: 'Your API key has been rotated due to subscription renewal.' });
  // }
  
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
  
  req.log.info({ tenantId, stripeCustomerId, expiresAt }, 'Invoice payment succeeded, tenant activated and expiration updated');
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

    // Create tenant and API key in a transaction
    let tenantId: string;
    try {
      const result = await seedTenantAndApiKey({
        tenantName: email,
        plan: 'standard',
        apiKeyHash: hashed,
      });
      tenantId = result.tenantId;
      
      // Validate tenant was created successfully
      if (!tenantId) {
        throw new Error('Failed to create tenant: tenantId is null or undefined');
      }
      
      // Verify tenant exists in database before proceeding
      const { pool } = getDb();
      const tenantCheck = await pool.query(
        'SELECT id FROM tenants WHERE id = $1',
        [tenantId]
      );
      
      if (tenantCheck.rows.length === 0) {
        throw new Error(`Invalid tenant_id: ${tenantId} - tenant not found in database`);
      }
      
      req.log.info({ email, tenantId }, 'Tenant and API key created successfully');
    } catch (dbError: any) {
      // Check for foreign key violation
      if (dbError?.code === '23503' || dbError?.message?.includes('foreign key')) {
        req.log.error({ 
          error: dbError, 
          email, 
          message: 'Foreign key violation - tenant_id is invalid' 
        }, 'Database foreign key error when creating tenant/API key');
        throw new Error(`Invalid tenant_id foreign key: ${dbError.message}`);
      }
      // Check for unique constraint violation (duplicate email)
      if (dbError?.code === '23505' || dbError?.message?.includes('unique constraint')) {
        req.log.warn({ email, error: dbError }, 'Tenant already exists, attempting to find existing tenant');
        // Try to find existing tenant
        const { pool } = getDb();
        const existingTenant = await pool.query(
          'SELECT id FROM tenants WHERE name = $1',
          [email]
        );
        if (existingTenant.rows.length > 0) {
          tenantId = existingTenant.rows[0].id;
          // Create API key for existing tenant
          await pool.query(
            'INSERT INTO api_keys(key_hash, tenant_id) VALUES ($1, $2) ON CONFLICT (key_hash) DO NOTHING',
            [hashed, tenantId]
          );
          req.log.info({ email, tenantId }, 'Using existing tenant, API key added');
        } else {
          throw new Error(`Failed to create or find tenant for email: ${email}`);
        }
      } else {
        throw dbError;
      }
    }

    const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || '';
    const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || '';
    
    // Set subscription expiration to 30 days from now (standard billing cycle)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    const { pool } = getDb();
    
    // Validate tenant_id again before updating
    const tenantValidation = await pool.query(
      'SELECT id FROM tenants WHERE id = $1',
      [tenantId]
    );
    
    if (tenantValidation.rows.length === 0) {
      throw new Error(`Cannot update tenant: tenant_id ${tenantId} does not exist`);
    }
    
    if (stripeCustomerId && stripeSubscriptionId) {
      await pool.query(
        'UPDATE tenants SET stripe_customer_id = $1, stripe_subscription_id = $2, status = $3, active = $4, expires_at = $5 WHERE id = $6',
        [stripeCustomerId, stripeSubscriptionId, 'active', true, expiresAt, tenantId]
      );
    } else if (stripeCustomerId) {
      await pool.query(
        'UPDATE tenants SET stripe_customer_id = $1, status = $2, active = $3, expires_at = $4 WHERE id = $5',
        [stripeCustomerId, 'active', true, expiresAt, tenantId]
      );
    } else if (stripeSubscriptionId) {
      await pool.query(
        'UPDATE tenants SET stripe_subscription_id = $1, status = $2, active = $3, expires_at = $4 WHERE id = $5',
        [stripeSubscriptionId, 'active', true, expiresAt, tenantId]
      );
    } else {
      // No Stripe IDs yet, but still set status and expiration
      await pool.query(
        'UPDATE tenants SET status = $1, active = $2, expires_at = $3 WHERE id = $4',
        ['active', true, expiresAt, tenantId]
      );
    }

    const state = tenants.get(tenantId) || {
      active: false,
      usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
    } as TenantState;
    
    state.active = true;
    state.graceUntil = undefined;
    tenants.set(tenantId, state);

    req.log.info({ email, tenantId, apiKey }, 'New subscription created, API key generated');
    
    // Store API key in Redis for success page display (expires in 24 hours)
    // Works for both test and live Stripe sessions
    const sessionId = session.id;
    if (sessionId) {
      try {
        await redisConnection.setex(`api_key:${sessionId}`, 86400, apiKey); // 24 hours = 86400 seconds
        req.log.info({ sessionId }, 'API key stored in Redis for success page');
      } catch (redisError) {
        // Don't fail webhook if Redis storage fails - email will still be sent
        req.log.warn({ 
          sessionId, 
          error: redisError instanceof Error ? redisError.message : String(redisError) 
        }, 'Failed to store API key in Redis (will still send email)');
      }
    }
    
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
    req.log.error({ 
      error, 
      email,
      errorCode: (error as any)?.code,
      errorMessage: error instanceof Error ? error.message : String(error)
    }, 'Failed to create tenant and API key for new subscription');
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
  
  // Deactivate tenant and mark as inactive (grace period allows temporary access)
  const graceDays = parseInt(process.env.GRACE_DAYS || '7', 10);
  const graceUntil = new Date();
  graceUntil.setDate(graceUntil.getDate() + graceDays);
  
  await pool.query(
    'UPDATE tenants SET active = false, status = $1, grace_until = $2 WHERE id = $3',
    ['inactive', graceUntil, tenantId]
  );
  
  const state = tenants.get(tenantId) || {
    active: false,
    usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
  } as TenantState;
  
  state.active = false;
  state.graceUntil = graceUntil.getTime();
  tenants.set(tenantId, state);
  
  req.log.warn({ tenantId, graceUntil }, 'Payment failed - entered grace period');
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
  
  // Deactivate tenant, mark as expired, and clear subscription ID
  await pool.query(
    'UPDATE tenants SET active = false, status = $1, stripe_subscription_id = NULL WHERE id = $2',
    ['expired', tenantId]
  );
  
  const state = tenants.get(tenantId) || {
    active: false,
    usage: { requests: 0, minutes: 0, jobs: 0, storage: 0, cap: 100000 },
  } as TenantState;
  
  state.active = false;
  state.graceUntil = undefined;
  tenants.set(tenantId, state);
  
  req.log.warn({ tenantId, stripeSubscriptionId }, 'Subscription deleted - tenant deactivated and marked as expired');
  
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
    await pool.query(
      'UPDATE tenants SET active = $1, status = $2, stripe_subscription_id = $3, expires_at = $4 WHERE id = $5',
      [isActive, tenantStatus, stripeSubscriptionId, expiresAt, tenantId]
    );
  } else {
    await pool.query(
      'UPDATE tenants SET active = $1, status = $2, stripe_subscription_id = $3 WHERE id = $4',
      [isActive, tenantStatus, stripeSubscriptionId, tenantId]
    );
  }
  
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

