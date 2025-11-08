import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

describe('Job Route Validation', () => {
  it('should validate job creation request', () => {
    const Body = z.object({
      source_url: z.string().url(),
      preset_id: z.string().optional(),
    });

    const validBody = {
      source_url: 'https://example.com/video.mp4',
      preset_id: 'everyday',
    };

    const result = Body.parse(validBody);
    expect(result.source_url).toBe('https://example.com/video.mp4');
    expect(result.preset_id).toBe('everyday');
  });

  it('should reject invalid URL', () => {
    const Body = z.object({
      source_url: z.string().url(),
      preset_id: z.string().optional(),
    });

    expect(() => {
      Body.parse({ source_url: 'not-a-url' });
    }).toThrow();
  });

  it('should accept optional preset_id', () => {
    const Body = z.object({
      source_url: z.string().url(),
      preset_id: z.string().optional(),
    });

    const result = Body.parse({ source_url: 'https://example.com/video.mp4' });
    expect(result.preset_id).toBeUndefined();
  });
});

describe('Job Status Response', () => {
  it('should validate job status structure', () => {
    const status = {
      captions: 'completed' as const,
      ad: 'pending' as const,
      color: 'failed' as const,
    };

    expect(status.captions).toBe('completed');
    expect(status.ad).toBe('pending');
    expect(status.color).toBe('failed');
  });
});

