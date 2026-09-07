import crypto from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Admin routes are intentionally opt-in in production and always require a
 * configured secret. Hashing both values before comparing keeps comparison
 * work fixed-size and avoids a variable-length early return.
 */
export function constantTimeSecretEquals(expected: string, provided: string): boolean {
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  const providedDigest = crypto.createHash('sha256').update(provided).digest();
  return crypto.timingSafeEqual(expectedDigest, providedDigest);
}

export function requireAdminAccess(req: FastifyRequest, reply: FastifyReply): boolean {
  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_ENDPOINTS_ENABLED !== '1') {
    reply.code(403).send({ success: false, error: 'Forbidden' });
    return false;
  }

  const expected = process.env.ADMIN_API_KEY;
  const provided = req.headers['x-admin-key'];
  if (!expected || typeof provided !== 'string' || !constantTimeSecretEquals(expected, provided)) {
    reply.code(403).send({ success: false, error: 'Forbidden' });
    return false;
  }

  return true;
}