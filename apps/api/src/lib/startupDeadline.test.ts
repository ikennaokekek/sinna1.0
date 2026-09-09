import { describe, expect, it } from 'vitest';
import { runWithinApiStartupDeadline } from './startupDeadline';

describe('runWithinApiStartupDeadline', () => {
  it('rejects a stalled aggregate startup before a late listener can bind', async () => {
    const stalled = new Promise<void>(() => undefined);
    const startedAt = Date.now();
    await expect(runWithinApiStartupDeadline(() => stalled, 10)).rejects.toThrow(
      'Core API startup deadline exceeded',
    );
    expect(Date.now() - startedAt).toBeLessThan(250);
  });
});