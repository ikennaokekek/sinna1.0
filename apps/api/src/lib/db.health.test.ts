import { describe, expect, it } from 'vitest';
import { checkPoolHealth } from './db';

describe('checkPoolHealth', () => {
  it('fails closed within its deadline when the PostgreSQL query stalls', async () => {
    const stalled = new Promise<{ rows: unknown[] }>(() => undefined);
    const startedAt = Date.now();
    await expect(checkPoolHealth(10, () => stalled)).resolves.toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(250);
  });
});