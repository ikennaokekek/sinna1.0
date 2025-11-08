import { describe, it, expect, beforeEach, vi } from 'vitest';
import { incrementAndGateUsage } from './usage';
import { getDb } from './db';

// Mock the database
vi.mock('./db', () => ({
  getDb: vi.fn(),
}));

describe('incrementAndGateUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should block when minutes cap is exceeded', async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ minutes_used: 1001, jobs: 0, egress_bytes: 0, period_start: new Date(), plan: 'standard' }] })
          .mockResolvedValueOnce({}), // ROLLBACK
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      }),
    };

    (getDb as any).mockReturnValue({ pool: mockPool });

    const result = await incrementAndGateUsage('tenant-1', { minutes: 1 });
    
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('minutes');
  });

  it('should allow usage when within limits', async () => {
    const mockClient = {
      query: vi.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ minutes_used: 100, jobs: 50, egress_bytes: 1000, period_start: new Date(), plan: 'standard' }] })
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}), // COMMIT
      release: vi.fn(),
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };

    (getDb as any).mockReturnValue({ pool: mockPool });

    const result = await incrementAndGateUsage('tenant-1', { minutes: 10 });
    
    expect(result.blocked).toBe(false);
    expect(result.usageAfter?.minutes).toBe(110);
  });
});

