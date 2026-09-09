export type DatabaseSslMode = 'disable' | 'require' | 'verify-full';

export function databaseSslConfig(
  env: NodeJS.ProcessEnv = process.env,
): false | { rejectUnauthorized: boolean } {
  const mode = (env.DATABASE_SSL_MODE ||
    (env.NODE_ENV === 'production' ? 'require' : 'disable')) as DatabaseSslMode;

  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  if (mode === 'verify-full') return { rejectUnauthorized: true };
  throw new Error('DATABASE_SSL_MODE must be disable, require, or verify-full');
}