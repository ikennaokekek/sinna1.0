import { describe, expect, it } from 'vitest';
import { checkReadiness } from './readiness';

describe('checkReadiness', () => {
  it('returns named checks and fails closed', async () => {
    await expect(checkReadiness(async () => true, async () => false))
      .resolves.toEqual({ ok: false, checks: { postgres: 'up', redis: 'down' } });
  });

  it('bounds a stalled dependency', async () => {
    const never = () => new Promise<boolean>(() => undefined);
    await expect(checkReadiness(never, async () => true, 5))
      .resolves.toEqual({ ok: false, checks: { postgres: 'down', redis: 'up' } });
  });
});