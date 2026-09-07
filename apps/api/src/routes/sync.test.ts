import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import {
  normalizeSubscriptionStatus,
  SyncPayloadSchema,
  validateSyncOrigin,
} from './sync';

const validPayload = {
  tenantId: '550e8400-e29b-41d4-a716-446655440000',
  email: '  Customer@Example.COM ',
  hashed_api_key: 'A'.repeat(64),
  plan: 'standard',
  subscription_status: 'active',
  expires_at: '2030-01-01T00:00:00.000Z',
};

function requestWithSecret(secret?: string): FastifyRequest {
  return {
    headers: secret === undefined ? {} : { 'x-sync-secret': secret },
  } as FastifyRequest;
}

describe('tenant sync input policy', () => {
  it('normalizes email and key hash before storage', () => {
    const payload = SyncPayloadSchema.parse(validPayload);
    expect(payload.email).toBe('customer@example.com');
    expect(payload.hashed_api_key).toBe('a'.repeat(64));
  });

  it('rejects malformed hashes and unknown commercial statuses', () => {
    expect(() => SyncPayloadSchema.parse({ ...validPayload, hashed_api_key: 'not-a-hash' })).toThrow();
    expect(() => SyncPayloadSchema.parse({ ...validPayload, subscription_status: 'unsupported' })).toThrow();
  });

  it.each([
    ['active', 'active'],
    ['trialing', 'active'],
    ['past_due', 'inactive'],
    ['incomplete', 'inactive'],
    ['paused', 'inactive'],
    ['canceled', 'expired'],
    ['unpaid', 'expired'],
    ['expired', 'expired'],
    ['incomplete_expired', 'expired'],
  ])('maps %s to Core state %s', (external, internal) => {
    expect(normalizeSubscriptionStatus(external)).toBe(internal);
  });
});

describe('tenant sync service authentication', () => {
  const originalSecret = process.env.REPLIT_SYNC_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.REPLIT_SYNC_SECRET;
    else process.env.REPLIT_SYNC_SECRET = originalSecret;
  });

  it('fails closed without a configured service credential', () => {
    delete process.env.REPLIT_SYNC_SECRET;
    expect(validateSyncOrigin(requestWithSecret('any-value')).valid).toBe(false);
  });

  it('requires an exact configured credential', () => {
    process.env.REPLIT_SYNC_SECRET = 'sync-service-secret';
    expect(validateSyncOrigin(requestWithSecret()).valid).toBe(false);
    expect(validateSyncOrigin(requestWithSecret('sync-service-secrex')).valid).toBe(false);
    expect(validateSyncOrigin(requestWithSecret('sync-service-secret')).valid).toBe(true);
  });
});