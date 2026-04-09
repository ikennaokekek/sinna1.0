import { describe, it, expect, beforeAll } from 'vitest';

/**
 * HTTP smoke tests against a running API (local or deployed).
 * Fails fast in beforeAll if the server is unreachable (skipIf + beforeAll is wrong:
 * skipIf is evaluated at collection time, before beforeAll runs).
 *
 * Env:
 *   E2E_BASE_URL or API_BASE_URL — default http://127.0.0.1:4000
 *   API_KEY or TEST_API_KEY — required for authenticated checks
 */
const base =
  process.env.E2E_BASE_URL || process.env.API_BASE_URL || 'http://127.0.0.1:4000';
const apiKey = process.env.API_KEY || process.env.TEST_API_KEY || '';

describe('Integration smoke: Sinna API', () => {
  beforeAll(async () => {
    try {
      const res = await fetch(`${base}/health`, { method: 'GET' });
      if (res.status !== 401 && res.status !== 200) {
        throw new Error(
          `GET ${base}/health returned ${res.status}; expected 401 or 200`
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('GET ')) throw e;
      throw new Error(`API not reachable at ${base}/health: ${String(e)}`);
    }
  });
  it('GET /health without API key returns 401', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('unauthorized');
  });

  it('POST /v1/jobs without API key returns 401', async () => {
    const res = await fetch(`${base}/v1/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_url: 'https://example.com/video.mp4',
        preset_id: 'adhd',
      }),
    });
    expect(res.status).toBe(401);
  });

  describe.skipIf(!apiKey)('with API_KEY', () => {
    it('GET /health with API key returns 200 and ok: true', async () => {
      const res = await fetch(`${base}/health`, {
        headers: { 'x-api-key': apiKey },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok?: boolean; uptime?: number };
      expect(body.ok).toBe(true);
      expect(typeof body.uptime).toBe('number');
    });

    it('POST /v1/jobs with invalid preset_id returns 400', async () => {
      const res = await fetch(`${base}/v1/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          source_url: 'https://example.com/video.mp4',
          preset_id: '__not_a_listed_preset__',
        }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        success?: boolean;
        error?: string;
        statusCode?: number;
        code?: string;
      };
      // Fastify serialises schema failures as { error: "Bad Request" }; handlers use { success: false, ... }.
      expect(
        body.success === false ||
          body.error === 'Bad Request' ||
          body.statusCode === 400 ||
          typeof body.code === 'string'
      ).toBe(true);
    });
  });
});
