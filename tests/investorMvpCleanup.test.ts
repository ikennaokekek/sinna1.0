import { describe, expect, it, vi } from 'vitest';
import { removeQueueJobStrict } from '../scripts/lib/investorMvpCleanup';

describe('investor MVP queue cleanup', () => {
  it('rejects a zero-result removal when the job remains locked or present', async () => {
    const queue = {
      remove: vi.fn().mockResolvedValue(0),
      getJob: vi.fn().mockResolvedValue({ id: 'locked-job' }),
    };

    await expect(removeQueueJobStrict(queue as any, 'locked-job'))
      .rejects.toThrow('still present after removal');
  });

  it('accepts a zero-result removal only when the job is already absent', async () => {
    const queue = {
      remove: vi.fn().mockResolvedValue(0),
      getJob: vi.fn().mockResolvedValue(undefined),
    };

    await expect(removeQueueJobStrict(queue as any, 'gone-job')).resolves.toBeUndefined();
  });
});