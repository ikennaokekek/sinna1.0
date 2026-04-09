import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { seedTenantAndApiKey, resetDbClientsForTests } from './db';

vi.mock('pg', () => ({
  Pool: vi.fn(),
}));

describe('seedTenantAndApiKey', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';
    resetDbClientsForTests();
    vi.mocked(Pool).mockReset();
  });

  it('should create tenant and API key', async () => {
    const mockClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT existing tenant
        .mockResolvedValueOnce({ rows: [{ id: 'tenant-123' }] }) // INSERT tenant RETURNING
        .mockResolvedValueOnce({}) // INSERT api_key
        .mockResolvedValueOnce({}), // COMMIT
      release: vi.fn(),
    };

    vi.mocked(Pool).mockImplementation(
      () =>
        ({
          connect: vi.fn().mockResolvedValue(mockClient),
          on: vi.fn(),
          end: vi.fn().mockResolvedValue(undefined),
        }) as unknown as Pool
    );

    const result = await seedTenantAndApiKey({
      tenantName: 'test@example.com',
      plan: 'standard',
      apiKeyHash: 'hashed-key-123',
    });

    expect(result.tenantId).toBe('tenant-123');
    expect(mockClient.query).toHaveBeenCalled();
  });

  it('should rollback on error', async () => {
    const mockClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')),
      release: vi.fn(),
    };

    vi.mocked(Pool).mockImplementation(
      () =>
        ({
          connect: vi.fn().mockResolvedValue(mockClient),
          on: vi.fn(),
          end: vi.fn().mockResolvedValue(undefined),
        }) as unknown as Pool
    );

    await expect(
      seedTenantAndApiKey({
        tenantName: 'test@example.com',
        plan: 'standard',
        apiKeyHash: 'hashed-key-123',
      })
    ).rejects.toThrow('Database error');
  });
});
