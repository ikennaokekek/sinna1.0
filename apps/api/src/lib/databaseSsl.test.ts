import { describe, expect, it } from 'vitest';
import { databaseSslConfig } from '@sinna/types';

describe('databaseSslConfig', () => {
  it('supports explicit provider-neutral SSL modes', () => {
    expect(databaseSslConfig({ DATABASE_SSL_MODE: 'disable' })).toBe(false);
    expect(databaseSslConfig({ DATABASE_SSL_MODE: 'require' })).toEqual({
      rejectUnauthorized: false,
    });
    expect(databaseSslConfig({ DATABASE_SSL_MODE: 'verify-full' })).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('defaults production to encrypted transport and rejects unknown modes', () => {
    expect(databaseSslConfig({ NODE_ENV: 'production' })).toEqual({
      rejectUnauthorized: false,
    });
    expect(() => databaseSslConfig({ DATABASE_SSL_MODE: 'unknown' })).toThrow(
      /DATABASE_SSL_MODE/,
    );
  });
});