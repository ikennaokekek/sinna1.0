import { describe, expect, it } from 'vitest';
import { databasePoolConfig } from './db';

describe('databasePoolConfig', () => {
  it('uses scale-to-zero-friendly Autoscale defaults', () => {
    expect(databasePoolConfig({})).toMatchObject({
      max: 5,
      min: 0,
      connectionTimeoutMillis: 1_500,
    });
  });

  it('accepts a bounded per-instance connection budget', () => {
    expect(databasePoolConfig({ DB_POOL_MAX: '8', DB_POOL_MIN: '1' })).toMatchObject({
      max: 8,
      min: 1,
    });
  });

  it('rejects invalid or excessive connection budgets', () => {
    expect(() => databasePoolConfig({ DB_POOL_MAX: '0' })).toThrow(/DB_POOL_MAX/);
    expect(() => databasePoolConfig({ DB_POOL_MAX: '3', DB_POOL_MIN: '4' })).toThrow(
      /DB_POOL_MIN/,
    );
  });
});