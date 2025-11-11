import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { sendErrorResponse, createError, ErrorCodes } from '../lib/errors';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { performanceMonitor } from '../lib/logger';

export function registerBillingRoutes(app: FastifyInstance, stripe: Stripe | null): void {
  // Create subscription Checkout Session for Standard plan
  app.post('/v1/billing/subscribe', {
    schema: {
      description: 'Create a Stripe Checkout Session for Standard plan subscription',
      tags: ['Billing'],
      security: [{ ApiKeyAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                url: { type: 'string', nullable: true }
              }
            }
          }
        },
        401: {
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
    const perfId = performanceMonitor.start('billing_subscribe', (req as AuthenticatedRequest).requestId);
    
    try {
      const tenantId = (req as AuthenticatedRequest).tenantId;
      if (!tenantId) {
        return res.code(401).send({ success: false, error: ErrorCodes.UNAUTHORIZED });
      }
      
      if (!stripe) {
        return res.code(503).send({ success: false, error: ErrorCodes.STRIPE_UNCONFIGURED });
      }
      
      const priceId = process.env.STRIPE_STANDARD_PRICE_ID || '';
      if (!priceId) {
        return res.code(503).send({ success: false, error: ErrorCodes.MISSING_PRICE });
      }
      
      const baseUrl = process.env.BASE_URL_PUBLIC || 'https://sinna.site';
      // Stripe minimum is 30 minutes, using 35 to account for clock skew
      const expiresAt = Math.floor(Date.now() / 1000) + (35 * 60); // 35 minutes from now
      
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/billing/success`,
        cancel_url: `${baseUrl}/billing/cancel`,
        expires_at: expiresAt, // Expires in 35 minutes
        client_reference_id: tenantId,
        subscription_data: {
          metadata: { tenantId },
        },
      });
      
      performanceMonitor.end(perfId);
      const response: ApiResponse<{ url: string | null }> = {
        success: true,
        data: { url: session.url },
      };
      return res.send(response);
    } catch (error) {
      performanceMonitor.end(perfId);
      req.log.error({ err: error }, 'Failed to create Stripe Checkout Session');
      return sendErrorResponse(res, error instanceof Error ? error : new Error(String(error)), 500);
    }
  });
}

