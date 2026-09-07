import { beforeEach, describe, expect, it, vi } from 'vitest';

const { Pool, query, release } = vi.hoisted(() => ({
  Pool: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock('pg', () => ({ Pool }));

import { resetDbClientsForTests, withTransaction } from './db';

describe('database transaction rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITEST = 'true';
    process.env.DATABASE_URL = 'postgres://unit-test-only';
    resetDbClientsForTests();
    Pool.mockImplementation(function () {
      return {
        connect: vi.fn().mockResolvedValue({ query, release }),
        on: vi.fn(),
        end: vi.fn(),
      };
    });
  });

  it('rolls back and releases the client when a lifecycle update fails', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE tenants')) throw new Error('update failed');
      return { rows: [] };
    });

    await expect(withTransaction(async (client) => {
      await client.query('UPDATE tenants SET active = true');
    })).rejects.toThrow('update failed');

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'UPDATE tenants SET active = true',
      'ROLLBACK',
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});