import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seedTenantAndApiKey } from './db';
import { getDb } from './db';

vi.mock('./db', async () => {
  const actual = await vi.importActual('./db');
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

describe('seedTenantAndApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create tenant and API key', async () => {
    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'tenant-123' }] }) // INSERT tenant
        .mockResolvedValueOnce({}) // INSERT api_key
        .mockResolvedValueOnce({}), // COMMIT
      release: vi.fn(),
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };

    (getDb as any).mockReturnValue({ pool: mockPool });

    const result = await seedTenantAndApiKey({
      tenantName: 'test@example.com',
      plan: 'standard',
      apiKeyHash: 'hashed-key-123',
    });

    expect(result.tenantId).toBe('tenant-123');
    expect(mockClient.query).toHaveBeenCalledTimes(4);
  });

  it('should rollback on error', async () => {
    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')) // INSERT tenant fails
        .mockResolvedValueOnce({}), // ROLLBACK
      release: vi.fn(),
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };

    (getDb as any).mockReturnValue({ pool: mockPool });

    await expect(
      seedTenantAndApiKey({
        tenantName: 'test@example.com',
        plan: 'standard',
        apiKeyHash: 'hashed-key-123',
      })
    ).rejects.toThrow('Database error');
  });
});

