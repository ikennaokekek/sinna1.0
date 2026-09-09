import { describe, expect, it } from 'vitest';
import { withDeadline } from '@sinna/types';

describe('withDeadline', () => {
  it('returns completed operations', async () => {
    await expect(withDeadline(Promise.resolve('ok'), 50, 'timed out')).resolves.toBe('ok');
  });

  it('rejects stalled startup operations within the deadline', async () => {
    const stalled = new Promise<never>(() => undefined);
    await expect(withDeadline(stalled, 5, 'startup timed out')).rejects.toThrow(
      'startup timed out',
    );
  });
});