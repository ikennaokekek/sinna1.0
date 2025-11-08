import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../lib/db';
import { sendErrorResponse, ErrorCodes } from '../lib/errors';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { performanceMonitor } from '../lib/logger';

export interface SubscriptionResponse {
  status: 'active' | 'cancelled' | 'past_due' | 'unpaid' | 'trialing' | 'unknown';
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  active: boolean;
  grace_until: string | null;
  created_at: string;
}

export function registerSubscriptionRoutes(app: FastifyInstance): void {
  // GET /v1/me/subscription: Get current subscription details
  app.get('/v1/me/subscription', {
    schema: {
      description: 'Get current subscription details',
      tags: ['Subscription'],
      security: [{ ApiKeyAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['active', 'cancelled', 'past_due', 'unpaid', 'trialing', 'unknown']
                },
                plan: { type: 'string' },
                stripe_customer_id: { type: 'string', nullable: true },
                stripe_subscription_id: { type: 'string', nullable: true },
                active: { type: 'boolean' },
                grace_until: { type: 'string', nullable: true },
                created_at: { type: 'string', format: 'date-time' }
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
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (req: FastifyRequest, res: FastifyReply) => {
    const perfId = performanceMonitor.start('get_subscription', (req as AuthenticatedRequest).requestId);
    
    try {
      const tenantId = (req as AuthenticatedRequest).tenantId;
      if (!tenantId) {
        return res.code(401).send({ success: false, error: ErrorCodes.UNAUTHORIZED });
      }

      const { pool } = getDb();
      const { rows } = await pool.query(
        `SELECT 
          active,
          plan,
          stripe_customer_id,
          stripe_subscription_id,
          grace_until,
          created_at
         FROM tenants 
         WHERE id = $1`,
        [tenantId]
      );

      if (rows.length === 0) {
        return res.code(404).send({ success: false, error: ErrorCodes.NOT_FOUND });
      }

      const tenant = rows[0];
      
      // Determine subscription status
      let status: SubscriptionResponse['status'] = 'unknown';
      if (tenant.active) {
        status = 'active';
      } else if (tenant.grace_until && new Date(tenant.grace_until) > new Date()) {
        status = 'past_due';
      } else {
        status = 'cancelled';
      }

      const response: ApiResponse<SubscriptionResponse> = {
        success: true,
        data: {
          status,
          plan: tenant.plan || 'standard',
          stripe_customer_id: tenant.stripe_customer_id,
          stripe_subscription_id: tenant.stripe_subscription_id,
          active: tenant.active,
          grace_until: tenant.grace_until ? new Date(tenant.grace_until).toISOString() : null,
          created_at: new Date(tenant.created_at).toISOString(),
        },
      };

      performanceMonitor.end(perfId);
      return res.send(response);
    } catch (error) {
      performanceMonitor.end(perfId);
      req.log.error({ error }, 'Failed to get subscription details');
      sendErrorResponse(res, error instanceof Error ? error : new Error(String(error)));
    }
  });
}

