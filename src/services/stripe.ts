import Stripe from 'stripe';
import { logger } from '../utils/logger';

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceId: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: {
    requestsPerMonth: number;
    transcriptionMinutes: number;
    audioDescriptionMinutes: number;
    colorAnalysisRequests: number;
    webhookSupport: boolean;
    prioritySupport: boolean;
    customBranding: boolean;
  };
}

export interface CustomerData {
  id: string;
  email: string;
  name?: string;
  tenantId: string;
  subscriptionId?: string;
  subscriptionStatus?: Stripe.Subscription.Status;
  currentPeriodEnd?: Date;
  planId?: string;
}

export class StripeService {
  private stripe: Stripe;
  private webhookSecret: string;

  // Predefined subscription plans
  private plans: SubscriptionPlan[] = [
    {
      id: 'standard',
      name: 'Standard',
      priceId: 'price_standard_monthly',
      price: 1500,
      currency: 'usd',
      interval: 'month',
      features: {
        requestsPerMonth: 50000,
        transcriptionMinutes: 2500,
        audioDescriptionMinutes: 1250,
        colorAnalysisRequests: 2000,
        webhookSupport: true,
        prioritySupport: true,
        customBranding: true,
      }
    },
    {
      id: 'gold',
      name: 'Gold',
      priceId: 'price_gold_monthly',
      price: 3000,
      currency: 'usd',
      interval: 'month',
      features: {
        requestsPerMonth: 150000,
        transcriptionMinutes: 7500,
        audioDescriptionMinutes: 3750,
        colorAnalysisRequests: 6000,
        webhookSupport: true,
        prioritySupport: true,
        customBranding: true,
      }
    }
  ];

  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required');
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    logger.info('Stripe service initialized');
  }

  /**
   * Create a new customer
   */
  async createCustomer(data: {
    email: string;
    name?: string;
    tenantId: string;
    metadata?: Record<string, string>;
  }): Promise<CustomerData> {
    try {
      const customer = await this.stripe.customers.create({
        email: data.email,
        name: data.name,
        metadata: {
          tenantId: data.tenantId,
          ...data.metadata,
        },
      });

      logger.info('Customer created', { customerId: customer.id, email: data.email });

      return {
        id: customer.id,
        email: data.email,
        name: data.name,
        tenantId: data.tenantId,
      };

    } catch (error) {
      logger.error('Failed to create customer', { error, data });
      throw new Error('Failed to create customer');
    }
  }

  /**
   * Create subscription checkout session
   */
  async createCheckoutSession(data: {
    customerId: string;
    planId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<{ sessionId: string; url: string }> {
    try {
      const plan = this.plans.find(p => p.id === data.planId);
      if (!plan) {
        throw new Error(`Plan ${data.planId} not found`);
      }

      const session = await this.stripe.checkout.sessions.create({
        customer: data.customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        metadata: data.metadata,
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        subscription_data: {
          metadata: data.metadata,
        },
      });

      logger.info('Checkout session created', {
        sessionId: session.id,
        customerId: data.customerId,
        planId: data.planId
      });

      return {
        sessionId: session.id,
        url: session.url!,
      };

    } catch (error) {
      logger.error('Failed to create checkout session', { error, data });
      throw new Error('Failed to create checkout session');
    }
  }

  /**
   * Create customer portal session
   */
  async createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      logger.info('Portal session created', { customerId, sessionId: session.id });

      return {
        url: session.url,
      };

    } catch (error) {
      logger.error('Failed to create portal session', { error, customerId });
      throw new Error('Failed to create portal session');
    }
  }

  /**
   * Get customer subscription details
   */
  async getCustomerSubscription(customerId: string): Promise<CustomerData | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      
      if (customer.deleted) {
        return null;
      }

      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 1,
      });

      const subscription = subscriptions.data[0];
      
      const customerData: CustomerData = {
        id: customer.id,
        email: customer.email!,
        name: customer.name || undefined,
        tenantId: customer.metadata.tenantId,
      };

      if (subscription) {
        customerData.subscriptionId = subscription.id;
        customerData.subscriptionStatus = subscription.status;
        customerData.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        
        // Find plan by price ID
        const planPriceId = subscription.items.data[0]?.price.id;
        const plan = this.plans.find(p => p.priceId === planPriceId);
        customerData.planId = plan?.id;
      }

      return customerData;

    } catch (error) {
      logger.error('Failed to get customer subscription', { error, customerId });
      throw new Error('Failed to get customer subscription');
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<void> {
    try {
      if (immediately) {
        await this.stripe.subscriptions.cancel(subscriptionId);
        logger.info('Subscription cancelled immediately', { subscriptionId });
      } else {
        await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
        logger.info('Subscription set to cancel at period end', { subscriptionId });
      }

    } catch (error) {
      logger.error('Failed to cancel subscription', { error, subscriptionId });
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Process webhook event
   */
  async processWebhook(
    payload: string,
    signature: string,
    handlers: {
      onSubscriptionCreated?: (subscription: Stripe.Subscription) => Promise<void>;
      onSubscriptionUpdated?: (subscription: Stripe.Subscription) => Promise<void>;
      onSubscriptionDeleted?: (subscription: Stripe.Subscription) => Promise<void>;
      onInvoicePaymentSucceeded?: (invoice: Stripe.Invoice) => Promise<void>;
      onInvoicePaymentFailed?: (invoice: Stripe.Invoice) => Promise<void>;
    } = {}
  ): Promise<void> {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      logger.info('Processing webhook event', { type: event.type, id: event.id });

      switch (event.type) {
        case 'customer.subscription.created':
          if (handlers.onSubscriptionCreated) {
            await handlers.onSubscriptionCreated(event.data.object as Stripe.Subscription);
          }
          break;

        case 'customer.subscription.updated':
          if (handlers.onSubscriptionUpdated) {
            await handlers.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
          }
          break;

        case 'customer.subscription.deleted':
          if (handlers.onSubscriptionDeleted) {
            await handlers.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
          }
          break;

        case 'invoice.payment_succeeded':
          if (handlers.onInvoicePaymentSucceeded) {
            await handlers.onInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          }
          break;

        case 'invoice.payment_failed':
          if (handlers.onInvoicePaymentFailed) {
            await handlers.onInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          }
          break;

        default:
          logger.debug('Unhandled webhook event type', { type: event.type });
      }

    } catch (error) {
      logger.error('Webhook processing failed', { error });
      throw new Error('Webhook processing failed');
    }
  }

  /**
   * Get usage for a customer
   */
  async getCustomerUsage(customerId: string, period: 'current' | 'previous' = 'current'): Promise<{
    requests: number;
    transcriptionMinutes: number;
    audioDescriptionMinutes: number;
    colorAnalysisRequests: number;
    period: { start: Date; end: Date };
  }> {
    try {
      // In a real implementation, this would query your usage tracking system
      // For now, we'll return mock data
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      return {
        requests: Math.floor(Math.random() * 1000),
        transcriptionMinutes: Math.floor(Math.random() * 100),
        audioDescriptionMinutes: Math.floor(Math.random() * 50),
        colorAnalysisRequests: Math.floor(Math.random() * 20),
        period: {
          start: startOfMonth,
          end: endOfMonth,
        },
      };

    } catch (error) {
      logger.error('Failed to get customer usage', { error, customerId });
      throw new Error('Failed to get customer usage');
    }
  }

  /**
   * Get available plans
   */
  getPlans(): SubscriptionPlan[] {
    return this.plans;
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): SubscriptionPlan | undefined {
    return this.plans.find(p => p.id === planId);
  }

  /**
   * Check if customer has active subscription
   */
  async hasActiveSubscription(customerId: string): Promise<boolean> {
    try {
      const customer = await this.getCustomerSubscription(customerId);
      return customer?.subscriptionStatus === 'active' || 
             customer?.subscriptionStatus === 'trialing';
    } catch (error) {
      logger.error('Failed to check subscription status', { error, customerId });
      return false;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple API call to check connectivity
      await this.stripe.accounts.retrieve();
      return true;
    } catch (error) {
      logger.error('Stripe health check failed', { error });
      return false;
    }
  }
}

// Singleton instance
let stripeService: StripeService | null = null;

export const getStripeService = (): StripeService => {
  if (!stripeService) {
    stripeService = new StripeService();
  }
  return stripeService;
};
