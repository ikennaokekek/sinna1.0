import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import { getDb } from '../lib/db';
import { ErrorCodes, sendErrorResponse } from '../lib/errors';
import { performanceMonitor } from '../lib/logger';
import { redisConnection } from '../lib/redis';
import { AuthenticatedRequest } from '../types';
import {
  externalSubscriptionStatuses,
  normalizeSubscriptionStatus,
  TenantStatus,
} from '../lib/subscriptionStatus';
import {
  lockNormalizedEmail,
  lockTenantIdentityMutation,
  normalizeEmailIdentity,
} from '../lib/tenantIdentity';

let syncLimiter: RateLimiterRedis | RateLimiterMemory = new RateLimiterMemory({
  points: 10,
  duration: 60,
});

if (redisConnection) {
  syncLimiter = new RateLimiterRedis({
    storeClient: redisConnection,
    points: 10,
    duration: 60,
    keyPrefix: 'sync_rate_limit',
  });
}

export { normalizeSubscriptionStatus };
export type { TenantStatus };

/**
 * Core accepts syncs only from the configured onboarding service.  An
 * allowlist is deliberately not an alternative credential: proxy/IP headers
 * are not proof of the caller's identity.
 */
export function validateSyncOrigin(req: FastifyRequest): { valid: boolean } {
  const expected = process.env.REPLIT_SYNC_SECRET;
  const header = req.headers['x-sync-secret'];
  const provided = Array.isArray(header) ? undefined : header;

  if (!expected || !provided) return { valid: false };

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length) return { valid: false };

  return { valid: crypto.timingSafeEqual(expectedBytes, providedBytes) };
}

export const SyncPayloadSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID'),
  email: z.string().trim().toLowerCase().email('email must be a valid email address'),
  hashed_api_key: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'hashed_api_key must be a SHA-256 hash (64 hex characters)')
    .transform((value) => value.toLowerCase()),
  plan: z.enum(['standard', 'pro'], {
    errorMap: () => ({ message: 'plan must be "standard" or "pro"' }),
  }),
  subscription_status: z.enum(externalSubscriptionStatuses),
  expires_at: z.string().datetime('expires_at must be a valid ISO 8601 datetime'),
  stripe_customer_id: z.string().optional(),
  stripe_subscription_id: z.string().optional(),
});

export function registerSyncRoutes(app: FastifyInstance): void {
  app.post('/v1/sync/tenant', async (req: FastifyRequest, res: FastifyReply) => {
    const perfId = performanceMonitor.start('sync_tenant', (req as AuthenticatedRequest).requestId);

    try {
      const clientIP = req.ip || 'unknown';
      try {
        const rateLimitRes = await syncLimiter.consume(clientIP, 1);
        res.header('X-RateLimit-Limit', '10');
        res.header('X-RateLimit-Remaining', Math.max(0, rateLimitRes.remainingPoints));
      } catch (error: any) {
        const retrySec = Math.ceil((error.msBeforeNext || 1000) / 1000);
        res.header('Retry-After', retrySec);
        return res.code(429).send({
          success: false,
          error: ErrorCodes.RATE_LIMITED,
          retry_after_seconds: retrySec,
        });
      }

      // Check authority before parsing or logging any caller-controlled data.
      if (!validateSyncOrigin(req).valid) {
        req.log.warn({ ip: clientIP }, 'Sync request rejected: unauthorized service');
        return res.code(401).send({
          success: false,
          error: ErrorCodes.UNAUTHORIZED,
          message: 'Unauthorized sync service',
        });
      }

      const parsed = SyncPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        req.log.warn('Sync payload validation failed');
        return sendErrorResponse(res, new Error('Invalid sync payload'), 400);
      }

      const payload = parsed.data;
      const status = normalizeSubscriptionStatus(payload.subscription_status);
      const active = status === 'active';
      const { pool } = getDb();
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await lockTenantIdentityMutation(client);
        await lockNormalizedEmail(client, payload.email);

        // Lock every possible identity match.  This detects ID/email crossovers
        // rather than accepting whichever OR branch PostgreSQL returns first.
        const identityRes = await client.query(
          `SELECT id, name, email
             FROM tenants
             WHERE id = $1 OR LOWER(TRIM(email)) = $2 OR LOWER(TRIM(name)) = $2
            FOR UPDATE`,
          [payload.tenantId, payload.email],
        );
        const idMatch = identityRes.rows.find((row: { id: string }) => row.id === payload.tenantId);
        const emailMatch = identityRes.rows.find(
          (row: { email: string | null }) =>
            typeof row.email === 'string' && normalizeEmailIdentity(row.email) === payload.email,
        ) || identityRes.rows.find(
          (row: { name?: string }) =>
            typeof row.name === 'string' && normalizeEmailIdentity(row.name) === payload.email,
        );

        // A supplied UUID must never be associated with an existing email
        // record for another UUID.  Roll back before any tenant/key write.
        if (emailMatch && emailMatch.id !== payload.tenantId) {
          await client.query('ROLLBACK');
          return res.code(409).send({
            success: false,
            error: 'TENANT_ID_EMAIL_MISMATCH',
            message: 'Tenant ID and email belong to different tenants',
          });
        }

        let action: 'created' | 'updated';
        if (idMatch) {
          action = 'updated';
          await client.query(
            `UPDATE tenants
                SET name = $1, email = $1, plan = $2, active = $3, status = $4,
                    expires_at = $5, stripe_customer_id = COALESCE($6, stripe_customer_id),
                    stripe_subscription_id = COALESCE($7, stripe_subscription_id), updated_at = NOW()
              WHERE id = $8`,
            [
              payload.email,
              payload.plan,
              active,
              status,
              payload.expires_at,
              payload.stripe_customer_id ?? null,
              payload.stripe_subscription_id ?? null,
              payload.tenantId,
            ],
          );
        } else {
          action = 'created';
          await client.query(
            `INSERT INTO tenants
              (id, name, email, plan, active, status, expires_at, stripe_customer_id, stripe_subscription_id, created_at, updated_at)
             VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
            [
              payload.tenantId,
              payload.email,
              payload.plan,
              active,
              status,
              payload.expires_at,
              payload.stripe_customer_id ?? null,
              payload.stripe_subscription_id ?? null,
            ],
          );
        }

        // A hash may only ever belong to its current tenant.  Lock it before
        // rotation so concurrent requests cannot steal a credential.
        const keyOwnerRes = await client.query(
          'SELECT tenant_id FROM api_keys WHERE key_hash = $1 FOR UPDATE',
          [payload.hashed_api_key],
        );
        if (keyOwnerRes.rows[0] && keyOwnerRes.rows[0].tenant_id !== payload.tenantId) {
          throw Object.assign(new Error('API key hash belongs to another tenant'), {
            code: 'API_KEY_OWNERSHIP_CONFLICT',
          });
        }

        // Rotation is all-or-nothing: Core ends with exactly this one key.
        await client.query('DELETE FROM api_keys WHERE tenant_id = $1', [payload.tenantId]);
        await client.query(
          'INSERT INTO api_keys(key_hash, tenant_id, created_at) VALUES ($1, $2, NOW())',
          [payload.hashed_api_key, payload.tenantId],
        );
        await client.query('COMMIT');

        req.log.info({ tenantId: payload.tenantId, action, status }, 'Tenant sync completed');
        return res.send({
          success: true,
          message: `Tenant ${action} successfully`,
          data: { tenantId: payload.tenantId, synced: true, action },
        });
      } catch (dbError: any) {
        await client.query('ROLLBACK');
        if (dbError?.code === 'API_KEY_OWNERSHIP_CONFLICT') {
          return res.code(409).send({
            success: false,
            error: 'API_KEY_OWNERSHIP_CONFLICT',
            message: 'API key hash belongs to another tenant',
          });
        }
        // A concurrent sync can claim a previously-unseen hash between the
        // ownership check and INSERT.  The transaction has been rolled back,
        // so report it as a conflict rather than exposing database details.
        if (dbError?.code === '23505') {
          return res.code(409).send({
            success: false,
            error: 'SYNC_CONFLICT',
            message: 'Tenant or API key conflicts with an existing record',
          });
        }
        if (dbError?.code === '40P01' || dbError?.code === '40001') {
          return res.code(409).send({
            success: false,
            error: 'SYNC_CONFLICT',
            message: 'Concurrent tenant identity update conflicted; retry the sync',
          });
        }
        req.log.error({ code: dbError?.code, tenantId: payload.tenantId }, 'Database error during tenant sync');
        throw dbError;
      } finally {
        client.release();
      }
    } catch (error) {
      req.log.error({ error }, 'Unexpected error during tenant sync');
      return sendErrorResponse(res, error instanceof Error ? error : new Error('Tenant sync failed'), 500);
    } finally {
      performanceMonitor.end(perfId);
    }
  });
}