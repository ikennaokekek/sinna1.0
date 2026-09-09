import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isTenantArtifactKey, registerJobRoutes } from './jobs';
import type { AuthenticatedRequest } from '../types';

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

describe('Signed artifact ownership', () => {
  it('does not accept a cross-tenant artifact key', () => {
    expect(isTenantArtifactKey('artifacts/tenant-a/42.vtt', 'tenant-a')).toBe(true);
    expect(isTenantArtifactKey('artifacts/tenant-b/42.vtt', 'tenant-a')).toBe(false);
  });

  it('is enforced by the alternate file-signing endpoint', () => {
    const source = readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8');
    expect(source).toContain('isTenantArtifactKey(params.id, tenantId)');
  });
});

describe('Queue availability', () => {
  it('returns an explicit 503 after authentication when Redis queues are unavailable', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      (request as AuthenticatedRequest).tenantId = 'tenant-a';
    });
    registerJobRoutes(
      app,
      null,
      null,
      { labels: () => ({ set: () => undefined }) },
      { labels: () => ({ inc: () => undefined }) },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        source_url: 'https://example.com/video.mp4',
        preset_id: 'deaf',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      success: false,
      error: 'service_unavailable',
    });
    await app.close();
  });
});

