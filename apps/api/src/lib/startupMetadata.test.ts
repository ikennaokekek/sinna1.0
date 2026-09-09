import { describe, expect, it } from 'vitest';
import { apiStartupMetadata } from './startupMetadata';

describe('apiStartupMetadata', () => {
  it('records the exact approved runtime revision without exposing secrets', () => {
    expect(
      apiStartupMetadata({
        NODE_ENV: 'production',
        REVISION: 'a'.repeat(40),
        STRIPE_SECRET_KEY_LIVE: 'not-logged',
      }),
    ).toEqual({
      env: 'production',
      revision: 'a'.repeat(40),
      stripeLiveKeyPresent: true,
    });
  });
});