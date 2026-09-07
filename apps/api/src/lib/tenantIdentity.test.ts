import { describe, expect, it, vi } from 'vitest';
import {
  emailAdvisoryLockParts,
  lockNormalizedEmail,
  lockTenantIdentityMutation,
  normalizeEmailIdentity,
} from './tenantIdentity';

describe('normalized tenant identity lock', () => {
  it('normalizes the identity and deterministically derives two signed lock words', () => {
    expect(normalizeEmailIdentity(' Person@Example.COM ')).toBe('person@example.com');
    const parts = emailAdvisoryLockParts('person@example.com');
    expect(parts).toEqual(emailAdvisoryLockParts('person@example.com'));
    expect(parts).toHaveLength(2);
    for (const value of parts) {
      expect(value).toBeGreaterThanOrEqual(-2147483648);
      expect(value).toBeLessThanOrEqual(2147483647);
    }
  });

  it('normalizes whitespace-padded legacy email identities before comparison', () => {
    expect(normalizeEmailIdentity('  Customer@Example.COM  ')).toBe('customer@example.com');
  });

  it('acquires the transaction-scoped lock before identity queries', async () => {
    const client = { query: vi.fn().mockResolvedValue({}) };
    await lockNormalizedEmail(client, 'person@example.com');
    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
      emailAdvisoryLockParts('person@example.com'),
    );
  });

  it('serializes tenant identity mutations through a transaction-scoped lock', async () => {
    const client = { query: vi.fn().mockResolvedValue({}) };
    await lockTenantIdentityMutation(client);
    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
      [0x53494e4e, 0x41544944],
    );
  });
});