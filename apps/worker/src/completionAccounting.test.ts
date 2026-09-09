import { describe, expect, it, vi } from 'vitest';
import { recordWorkerCompletion } from './completionAccounting';

describe('worker completion accounting', () => {
  it('updates usage only when the completion claim is newly inserted', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const release = vi.fn();
    await recordWorkerCompletion({ connect: vi.fn().mockResolvedValue({ query, release }) }, {
      queueName: 'captions',
      jobId: 'job-1',
      tenantId: 'tenant-1',
      egressBytes: 42,
    });
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[3][0]).toContain('UPDATE public.usage_counters');
    expect(release).toHaveBeenCalledOnce();
  });

  it('does not double-count an existing completion', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({});
    const release = vi.fn();
    await recordWorkerCompletion({ connect: vi.fn().mockResolvedValue({ query, release }) }, {
      queueName: 'captions',
      jobId: 'job-1',
      tenantId: 'tenant-1',
      egressBytes: 42,
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the same client when accounting fails', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockRejectedValueOnce(new Error('usage update unavailable'))
      .mockResolvedValueOnce({});
    const release = vi.fn();
    await expect(recordWorkerCompletion(
      { connect: vi.fn().mockResolvedValue({ query, release }) },
      { queueName: 'captions', jobId: 'job-1', tenantId: 'tenant-1' },
    )).rejects.toThrow('usage update unavailable');
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalledOnce();
  });
});