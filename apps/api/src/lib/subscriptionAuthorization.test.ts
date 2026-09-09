import { describe, expect, it, vi } from 'vitest';
import { lookupTenantAuthorization } from './subscriptionAuthorization';

describe('lookupTenantAuthorization', () => {
  it('fails closed within its deadline when PostgreSQL stalls', async () => {
    const query = vi.fn(() => new Promise(() => undefined));
    const startedAt = Date.now();
    await expect(lookupTenantAuthorization({ query } as never, 'hash', 10))
      .rejects.toThrow(/authorization lookup deadline/);
    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      query_timeout: 10,
      values: ['hash', '1ms'],
    }));
  });
});