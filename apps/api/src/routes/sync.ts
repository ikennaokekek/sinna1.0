import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getDb } from '../lib/db';
import { sendErrorResponse, ErrorCodes } from '../lib/errors';
import { performanceMonitor } from '../lib/logger';
import { AuthenticatedRequest } from '../types';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { redisConnection } from '../lib/redis';

/**
 * Sync endpoint for Replit Developer Portal
 * 
 * This endpoint allows Replit to sync tenant and API key data to Render backend
 * after Stripe checkout completion. Replit handles:
 * - Stripe checkout
 * - Customer creation
 * - API key generation
 * - Email delivery
 * 
 * Render backend receives the sync request and stores the tenant/API key for authentication.
 */

// Rate limiter for sync endpoint (stricter than regular API)
// 10 requests per minute per IP
let syncLimiter: RateLimiterRedis | RateLimiterMemory = new RateLimiterMemory({ 
  points: 10, 
  duration: 60 
});

// Initialize Redis-based rate limiter if available
if (redisConnection) {
  syncLimiter = new RateLimiterRedis({
    storeClient: redisConnection,
    points: 10,
    duration: 60,
    keyPrefix: 'sync_rate_limit',
  });
}

/**
 * Validate sync request origin
 * Options:
 * 1. Shared secret (REPLIT_SYNC_SECRET)
 * 2. IP allowlist (REPLIT_IP_ALLOWLIST - comma-separated)
 */
function validateSyncOrigin(req: FastifyRequest): { valid: boolean; reason?: string } {
  // Option 1: Shared secret validation
  const syncSecret = process.env.REPLIT_SYNC_SECRET;
  if (syncSecret) {
    const providedSecret = req.headers['x-sync-secret'] as string;
    
    // DEBUG: Log secret comparison (without exposing actual values)
    if (!providedSecret) {
      return { valid: false, reason: 'Missing X-Sync-Secret header' };
    }
    
    const secretsMatch = providedSecret === syncSecret;
    const providedLength = providedSecret?.length || 0;
    const expectedLength = syncSecret.length;
    
    if (!secretsMatch) {
      return { 
        valid: false, 
        reason: `Secret mismatch: provided length ${providedLength}, expected length ${expectedLength}` 
      };
    }
    return { valid: true };
  }

  // Option 2: IP allowlist validation
  const ipAllowlist = process.env.REPLIT_IP_ALLOWLIST;
  if (ipAllowlist) {
    const allowedIPs = ipAllowlist.split(',').map(ip => ip.trim());
    const clientIP = req.ip || 
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string);
    
    if (!clientIP || !allowedIPs.includes(clientIP)) {
      return { valid: false, reason: `IP ${clientIP} not in allowlist` };
    }
    return { valid: true };
  }

  // If neither is configured, allow but log warning
  req.log.warn('No sync origin validation configured (REPLIT_SYNC_SECRET or REPLIT_IP_ALLOWLIST)');
  return { valid: true };
}

/**
 * Sync payload schema
 */
const SyncPayloadSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID'),
  email: z.string().email('email must be a valid email address'),
  hashed_api_key: z.string().regex(/^[a-f0-9]{64}$/i, 'hashed_api_key must be a SHA-256 hash (64 hex characters)'),
  plan: z.enum(['standard', 'pro'], { errorMap: () => ({ message: 'plan must be "standard" or "pro"' }) }),
  subscription_status: z.enum(['active', 'inactive', 'expired', 'trialing', 'past_due', 'canceled']),
  expires_at: z.string().datetime('expires_at must be a valid ISO 8601 datetime'),
  stripe_customer_id: z.string().optional(),
  stripe_subscription_id: z.string().optional(),
});

export function registerSyncRoutes(app: FastifyInstance): void {
  app.post('/v1/sync/tenant', {
    schema: {
      description: 'Sync tenant and API key from Replit Developer Portal (Internal)',
      tags: ['System'],
      hide: true, // Hide from public API docs (internal endpoint)
      body: {
        type: 'object',
        required: ['tenantId', 'email', 'hashed_api_key', 'plan', 'subscription_status', 'expires_at'],
        properties: {
          tenantId: {
            type: 'string',
            format: 'uuid',
            description: 'Tenant ID from Replit'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Customer email address'
          },
          hashed_api_key: {
            type: 'string',
            pattern: '^[a-f0-9]{64}$',
            description: 'SHA-256 hash of the API key'
          },
          plan: {
            type: 'string',
            enum: ['standard', 'pro'],
            description: 'Subscription plan'
          },
          subscription_status: {
            type: 'string',
            enum: ['active', 'inactive', 'expired', 'trialing', 'past_due', 'canceled'],
            description: 'Current subscription status'
          },
          expires_at: {
            type: 'string',
            format: 'date-time',
            description: 'Subscription expiration date (ISO 8601)'
          },
          stripe_customer_id: {
            type: 'string',
            description: 'Stripe customer ID (optional)'
          },
          stripe_subscription_id: {
            type: 'string',
            description: 'Stripe subscription ID (optional)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                tenantId: { type: 'string' },
                synced: { type: 'boolean' },
                action: { type: 'string', enum: ['created', 'updated', 'skipped'] }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        },
        429: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            retry_after_seconds: { type: 'number' }
          }
        }
      }
    }
  }, async (req: FastifyRequest, res: FastifyReply) => {
    const perfId = performanceMonitor.start('sync_tenant', (req as AuthenticatedRequest).requestId);
    
    // DEBUG: Log that request reached sync endpoint
    req.log.info({
      url: req.url,
      method: req.method,
      headers: {
        'x-sync-secret': req.headers['x-sync-secret'] ? '***present***' : 'missing',
        'content-type': req.headers['content-type'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip'],
      },
      ip: req.ip,
      hasBody: !!req.body,
    }, '🔍 DEBUG: Sync endpoint reached - request received');
    
    try {
      // Rate limiting
      const clientIP = req.ip || 
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        (req.headers['x-real-ip'] as string) ||
        'unknown';
      
      req.log.info({ clientIP }, '🔍 DEBUG: Client IP determined');
      
      try {
        const rateLimitRes = await syncLimiter.consume(clientIP, 1);
        res.header('X-RateLimit-Limit', '10');
        res.header('X-RateLimit-Remaining', Math.max(0, rateLimitRes.remainingPoints));
      } catch (rateLimitError: any) {
        const retrySec = Math.ceil((rateLimitError.msBeforeNext || 1000) / 1000);
        res.header('Retry-After', retrySec);
        performanceMonitor.end(perfId);
        return res.code(429).send({
          success: false,
          error: ErrorCodes.RATE_LIMITED,
          retry_after_seconds: retrySec
        });
      }

      // Validate origin (shared secret or IP allowlist)
      req.log.info({
        hasReplitSyncSecret: !!process.env.REPLIT_SYNC_SECRET,
        hasIpAllowlist: !!process.env.REPLIT_IP_ALLOWLIST,
        providedSecret: req.headers['x-sync-secret'] ? '***present***' : 'missing',
        secretLength: req.headers['x-sync-secret'] ? String(req.headers['x-sync-secret']).length : 0,
      }, '🔍 DEBUG: About to validate sync origin');
      
      const originValidation = validateSyncOrigin(req);
      
      req.log.info({
        valid: originValidation.valid,
        reason: originValidation.reason,
        envSecretSet: !!process.env.REPLIT_SYNC_SECRET,
        envSecretLength: process.env.REPLIT_SYNC_SECRET?.length || 0,
        providedSecretLength: req.headers['x-sync-secret'] ? String(req.headers['x-sync-secret']).length : 0,
        secretsMatch: process.env.REPLIT_SYNC_SECRET === req.headers['x-sync-secret'],
      }, '🔍 DEBUG: Origin validation result');
      
      if (!originValidation.valid) {
        req.log.warn({ 
          ip: clientIP,
          reason: originValidation.reason,
          envSecretSet: !!process.env.REPLIT_SYNC_SECRET,
          providedSecret: req.headers['x-sync-secret'] ? '***present***' : 'missing',
        }, '❌ Sync request rejected: invalid origin');
        performanceMonitor.end(perfId);
        return res.code(401).send({
          success: false,
          error: ErrorCodes.UNAUTHORIZED,
          message: originValidation.reason || 'Invalid origin'
        });
      }
      
      req.log.info({}, '✅ DEBUG: Origin validation passed');

      // Validate and parse payload
      let payload: z.infer<typeof SyncPayloadSchema>;
      try {
        payload = SyncPayloadSchema.parse(req.body);
      } catch (validationError: any) {
        req.log.warn({ error: validationError }, 'Sync payload validation failed');
        performanceMonitor.end(perfId);
        return sendErrorResponse(res, new Error(`Invalid payload: ${validationError.message}`), 400);
      }

      const { tenantId, email, hashed_api_key, plan, subscription_status, expires_at, stripe_customer_id, stripe_subscription_id } = payload;

      // Log sync request
      req.log.info({
        tenantId,
        email,
        plan,
        subscription_status,
        expires_at,
        source: 'replit_sync'
      }, 'Received tenant sync request from Replit');

      const { pool } = getDb();
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Check if tenant already exists (by tenantId or email)
        const existingTenantRes = await client.query(
          `SELECT id, name, email, plan, stripe_customer_id, stripe_subscription_id 
           FROM tenants 
           WHERE id = $1 OR email = $2 OR name = $2
           LIMIT 1`,
          [tenantId, email]
        );

        let action: 'created' | 'updated' | 'skipped';
        let finalTenantId: string;

        if (existingTenantRes.rows.length > 0) {
          const existing = existingTenantRes.rows[0];
          finalTenantId = existing.id as string;

          // Check if this is a duplicate sync (same tenantId)
          if (existing.id === tenantId) {
            req.log.info({ tenantId, email }, 'Tenant already exists with same ID, updating');
            action = 'updated';

            // Update tenant record
            await client.query(
              `UPDATE tenants 
               SET name = $1,
                   email = $1,
                   plan = $2, 
                   active = $3,
                   status = $4,
                   expires_at = $5,
                   stripe_customer_id = COALESCE($6, stripe_customer_id),
                   stripe_subscription_id = COALESCE($7, stripe_subscription_id),
                   updated_at = NOW()
               WHERE id = $8`,
              [
                email,
                plan,
                subscription_status === 'active' || subscription_status === 'trialing',
                subscription_status,
                expires_at,
                stripe_customer_id,
                stripe_subscription_id,
                tenantId
              ]
            );
          } else {
            // Different tenantId but same email - potential conflict
            req.log.warn({
              existingTenantId: existing.id,
              newTenantId: tenantId,
              email
            }, 'Duplicate email detected with different tenantId - skipping sync');
            action = 'skipped';
            await client.query('ROLLBACK');
            performanceMonitor.end(perfId);
            return res.send({
              success: false,
              message: `Email ${email} already exists with different tenantId ${existing.id}`,
              data: {
                tenantId: existing.id,
                synced: false,
                action: 'skipped'
              }
            });
          }
        } else {
          // Create new tenant
          req.log.info({ tenantId, email, plan }, 'Creating new tenant from Replit sync');
          action = 'created';

          const insertRes = await client.query(
            `INSERT INTO tenants(
              id, name, email, plan, active, status, expires_at, 
              stripe_customer_id, stripe_subscription_id, created_at, updated_at
            ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            RETURNING id`,
            [
              tenantId,      // $1 - id
              email,         // $2 - name and email (same value)
              plan,          // $3 - plan
              subscription_status === 'active' || subscription_status === 'trialing', // $4 - active
              subscription_status, // $5 - status
              expires_at,    // $6 - expires_at
              stripe_customer_id || null, // $7 - stripe_customer_id
              stripe_subscription_id || null // $8 - stripe_subscription_id
            ]
          );

          if (insertRes.rows.length === 0) {
            throw new Error('Failed to create tenant: no ID returned');
          }

          finalTenantId = insertRes.rows[0].id as string;
        }

        // Insert or update API key
        // Note: api_keys table has key_hash as primary key, not id
        const apiKeyExistsRes = await client.query(
          `SELECT key_hash FROM api_keys WHERE key_hash = $1 LIMIT 1`,
          [hashed_api_key]
        );

        if (apiKeyExistsRes.rows.length === 0) {
          // Insert new API key
          await client.query(
            `INSERT INTO api_keys(key_hash, tenant_id, created_at) 
             VALUES ($1, $2, NOW())
             ON CONFLICT (key_hash) DO NOTHING`,
            [hashed_api_key, finalTenantId]
          );
          req.log.info({ tenantId: finalTenantId }, 'API key synced from Replit');
        } else {
          req.log.info({ tenantId: finalTenantId }, 'API key already exists, skipping insert');
        }

        await client.query('COMMIT');

        performanceMonitor.end(perfId);
        req.log.info({
          tenantId: finalTenantId,
          email,
          action,
          subscription_status
        }, 'Tenant sync completed successfully');

        return res.send({
          success: true,
          message: `Tenant ${action} successfully`,
          data: {
            tenantId: finalTenantId,
            synced: true,
            action
          }
        });

      } catch (dbError: any) {
        await client.query('ROLLBACK');
        req.log.error({ error: dbError, tenantId, email }, 'Database error during tenant sync');
        
        // Handle specific database errors
        if (dbError?.code === '23505') {
          // Unique constraint violation
          performanceMonitor.end(perfId);
          return sendErrorResponse(res, new Error(`Duplicate tenant or API key: ${dbError.message}`), 400);
        } else if (dbError?.code === '23503') {
          // Foreign key violation
          performanceMonitor.end(perfId);
          return sendErrorResponse(res, new Error(`Invalid tenant reference: ${dbError.message}`), 400);
        }
        
        throw dbError;
      } finally {
        client.release();
      }

    } catch (error) {
      performanceMonitor.end(perfId);
      req.log.error({ error }, 'Unexpected error during tenant sync');
      return sendErrorResponse(res, error instanceof Error ? error : new Error(String(error)), 500);
    }
  });
}

