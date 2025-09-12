import { Request, Response } from 'express';
import { z } from 'zod';
import { getStripeService } from '../services/stripe';
import { getCurrentUsage } from '../middleware/paywall';
import { logger } from '../utils/logger';

// Validation schemas
const createCustomerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

const createCheckoutSchema = z.object({
  planId: z.string(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const webhookSchema = z.object({
  payload: z.string(),
  signature: z.string(),
});

export class BillingController {
  private stripeService = getStripeService();

  /**
   * Get available subscription plans
   * GET /api/v1/billing/plans
   */
  getPlans = async (req: Request, res: Response): Promise<void> => {
    try {
      const plans = this.stripeService.getPlans();

      res.status(200).json({
        success: true,
        data: {
          plans: plans.map(plan => ({
            ...plan,
            recommended: plan.id === 'standard' // Mark standard as recommended
          })),
          currency: 'USD',
          billingCycle: 'Monthly plans only'
        },
        message: 'Subscription plans retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to get plans', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve plans'
      });
    }
  };

  /**
   * Create Stripe customer
   * POST /api/v1/billing/customer
   */
  createCustomer = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = createCustomerSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      const customer = await this.stripeService.createCustomer({
        email: body.email,
        name: body.name,
        tenantId,
        metadata: {
          userId,
          ...body.metadata
        }
      });

      res.status(201).json({
        success: true,
        data: customer,
        message: 'Customer created successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error('Failed to create customer', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to create customer'
      });
    }
  };

  /**
   * Create checkout session
   * POST /api/v1/billing/checkout
   */
  createCheckout = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = createCheckoutSchema.parse(req.body);
      const { id: userId, tenantId } = req.user!;

      // First, ensure customer exists
      let customer;
      try {
        customer = await this.stripeService.getCustomerSubscription(userId);
      } catch (error) {
        // Customer doesn't exist, create one
        customer = await this.stripeService.createCustomer({
          email: req.user?.email || `${tenantId}@example.com`,
          tenantId,
          metadata: { userId }
        });
      }

      const baseUrl = process.env.BASE_URL || 'http://localhost:3002';
      const session = await this.stripeService.createCheckoutSession({
        customerId: customer.id,
        planId: body.planId,
        successUrl: body.successUrl || `${baseUrl}/dashboard?payment=success`,
        cancelUrl: body.cancelUrl || `${baseUrl}/dashboard?payment=cancelled`,
        metadata: {
          tenantId,
          userId,
          planId: body.planId
        }
      });

      res.status(201).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          checkoutUrl: session.url,
          planId: body.planId
        },
        message: 'Checkout session created successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      logger.error('Failed to create checkout', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to create checkout session'
      });
    }
  };

  /**
   * Create customer portal session
   * POST /api/v1/billing/portal
   */
  createPortal = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id: userId } = req.user!;
      const baseUrl = process.env.BASE_URL || 'http://localhost:3002';

      const customer = await this.stripeService.getCustomerSubscription(userId);
      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
        return;
      }

      const portal = await this.stripeService.createPortalSession(
        customer.id,
        `${baseUrl}/dashboard`
      );

      res.status(200).json({
        success: true,
        data: {
          portalUrl: portal.url
        },
        message: 'Portal session created successfully'
      });

    } catch (error) {
      logger.error('Failed to create portal', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to create portal session'
      });
    }
  };

  /**
   * Get current subscription and usage
   * GET /api/v1/billing/subscription
   */
  getSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id: userId, tenantId } = req.user!;

      const [customer, usage, stripeUsage] = await Promise.all([
        this.stripeService.getCustomerSubscription(userId).catch(() => null),
        getCurrentUsage(tenantId),
        this.stripeService.getCustomerUsage(userId).catch(() => null)
      ]);

      const plan = customer?.planId ? this.stripeService.getPlan(customer.planId) : null;

      res.status(200).json({
        success: true,
        data: {
          customer,
          plan,
          usage: {
            current: usage,
            billing: stripeUsage
          },
          hasActiveSubscription: customer?.subscriptionStatus === 'active' || 
                                 customer?.subscriptionStatus === 'trialing'
        },
        message: 'Subscription details retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to get subscription', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve subscription details'
      });
    }
  };

  /**
   * Cancel subscription
   * POST /api/v1/billing/cancel
   */
  cancelSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id: userId } = req.user!;
      const { immediately = false } = req.body;

      const customer = await this.stripeService.getCustomerSubscription(userId);
      if (!customer || !customer.subscriptionId) {
        res.status(404).json({
          success: false,
          error: 'No active subscription found'
        });
        return;
      }

      await this.stripeService.cancelSubscription(customer.subscriptionId, immediately);

      res.status(200).json({
        success: true,
        data: {
          subscriptionId: customer.subscriptionId,
          cancelledImmediately: immediately,
          accessUntil: immediately ? new Date() : customer.currentPeriodEnd
        },
        message: immediately ? 
          'Subscription cancelled immediately' : 
          'Subscription will cancel at the end of the current billing period'
      });

    } catch (error) {
      logger.error('Failed to cancel subscription', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to cancel subscription'
      });
    }
  };

  /**
   * Handle Stripe webhooks
   * POST /api/v1/billing/webhook
   */
  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const signature = req.headers['stripe-signature'] as string;
      const payload = req.body;

      if (!signature) {
        res.status(400).json({
          success: false,
          error: 'Missing stripe-signature header'
        });
        return;
      }

      await this.stripeService.processWebhook(payload, signature, {
        onSubscriptionCreated: async (subscription) => {
          logger.info('Subscription created', {
            subscriptionId: subscription.id,
            customerId: subscription.customer,
            status: subscription.status
          });
          
          // Here you would update your database with the new subscription
          // For now, we'll just log it
        },

        onSubscriptionUpdated: async (subscription) => {
          logger.info('Subscription updated', {
            subscriptionId: subscription.id,
            customerId: subscription.customer,
            status: subscription.status
          });
          
          // Update subscription status in your database
        },

        onSubscriptionDeleted: async (subscription) => {
          logger.info('Subscription deleted', {
            subscriptionId: subscription.id,
            customerId: subscription.customer
          });
          
          // Mark subscription as cancelled in your database
        },

        onInvoicePaymentSucceeded: async (invoice) => {
          logger.info('Invoice payment succeeded', {
            invoiceId: invoice.id,
            customerId: invoice.customer,
            amount: invoice.amount_paid
          });
          
          // Reset usage counters, extend access, etc.
        },

        onInvoicePaymentFailed: async (invoice) => {
          logger.warn('Invoice payment failed', {
            invoiceId: invoice.id,
            customerId: invoice.customer,
            amount: invoice.amount_due
          });
          
          // Handle failed payment - send notifications, restrict access, etc.
        }
      });

      res.status(200).json({ received: true });

    } catch (error) {
      logger.error('Webhook processing failed', { error });
      res.status(400).json({
        success: false,
        error: 'Webhook processing failed'
      });
    }
  };

  /**
   * Get billing history
   * GET /api/v1/billing/history
   */
  getBillingHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id: userId } = req.user!;
      const limit = parseInt(req.query.limit as string) || 10;

      const customer = await this.stripeService.getCustomerSubscription(userId);
      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
        return;
      }

      // In a real implementation, you'd fetch invoices from Stripe
      // For now, we'll return mock data
      const mockHistory = [
        {
          id: 'inv_1234',
          date: new Date().toISOString(),
          amount: 99.00,
          currency: 'usd',
          status: 'paid',
          description: 'Professional Plan - Monthly',
          downloadUrl: 'https://stripe.com/invoice/download/123'
        }
      ];

      res.status(200).json({
        success: true,
        data: {
          invoices: mockHistory,
          hasMore: false,
          customerId: customer.id
        },
        message: 'Billing history retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to get billing history', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve billing history'
      });
    }
  };
}
