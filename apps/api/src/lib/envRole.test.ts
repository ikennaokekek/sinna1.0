import { describe, expect, it } from 'vitest';
import { validateEnv } from '@sinna/types';

const core = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://example.test/core',
  REDIS_URL: 'redis://example.test:6379',
  QUEUE_PREFIX: 'sinna:test',
  R2_ACCOUNT_ID: 'account',
  R2_ACCESS_KEY_ID: 'access',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
};

describe('role-specific production environment validation', () => {
  it('does not require worker media credentials for the API', () => {
    expect(() => validateEnv(core, 'api')).not.toThrow();
  });

  it('retains media-provider requirements for the worker', () => {
    expect(() => validateEnv(core, 'worker')).toThrow(/CLOUDINARY_URL|ASSEMBLYAI_API_KEY/);
  });

  it('accepts the complete worker-only runtime contract without onboarding secrets', () => {
    expect(() => validateEnv({
      ...core,
      CLOUDINARY_URL: 'cloudinary://123:secret@example',
      ASSEMBLYAI_API_KEY: 'assembly',
      OPENAI_API_KEY: 'openai',
      WORKER_INSTANCE_ID: 'worker-primary',
      WORKER_CONCURRENCY: '1',
      WORKER_SHUTDOWN_TIMEOUT_MS: '60000',
    }, 'worker')).not.toThrow();
  });
});