import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Deep E2E: create a job for every preset, poll to terminal state, validate artifacts.
 * Requires API_KEY / TEST_API_KEY and a running API.
 */
const API_KEY = process.env.API_KEY || process.env.TEST_API_KEY;
const SAMPLE_VIDEO =
  process.env.E2E_SAMPLE_VIDEO_URL ||
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

const POLL_INTERVAL_MS = 5_000;
const JOB_TIMEOUT_MS = 10 * 60_000; // 10 minutes per job

// Load presets from config
const presetsPath = path.join(__dirname, '..', '..', 'config', 'presets.json');
let ALL_PRESETS: Record<string, any> = {};
try {
  ALL_PRESETS = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
} catch {
  // Fallback: minimal set if config file not found
  ALL_PRESETS = { everyday: {}, adhd: {}, blindness: {} };
}

const PRESET_NAMES = Object.keys(ALL_PRESETS);

async function pollJob(
  request: any,
  baseURL: string,
  jobId: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(`/v1/jobs/${jobId}`, { headers });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const status = body?.data?.status;
    if (status === 'completed' || status === 'failed') {
      return body.data;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Job ${jobId} did not reach terminal state within ${timeoutMs}ms`);
}

test.describe('POST /v1/jobs deep E2E — all presets', () => {
  test.skip(!API_KEY, 'Set API_KEY or TEST_API_KEY for preset E2E');

  // Increase timeout for polling jobs
  test.setTimeout(JOB_TIMEOUT_MS + 30_000);

  for (const preset of PRESET_NAMES) {
    const cfg = ALL_PRESETS[preset] || {};
    const expectsVideoTransform = !!cfg.videoTransform;

    test(`preset ${preset}: create → poll → validate artifacts`, async ({ request, baseURL }) => {
      const headers: Record<string, string> = {
        'x-api-key': API_KEY!,
        'Content-Type': 'application/json',
      };

      // 1. Create job
      const createRes = await request.post('/v1/jobs', {
        headers,
        data: { source_url: SAMPLE_VIDEO, preset_id: preset },
      });
      expect(createRes.status()).toBeLessThan(500);

      // Tolerate plan-limit or rate-limit responses
      if ([402, 429].includes(createRes.status())) {
        test.skip(true, `Skipped ${preset}: ${createRes.status()} (plan/rate limit)`);
        return;
      }
      expect([200, 201]).toContain(createRes.status());

      const createBody = await createRes.json();
      expect(createBody.success).toBe(true);
      const jobId = createBody.data?.id;
      expect(jobId).toBeTruthy();

      // Verify videoTransform step is present when preset declares it
      if (expectsVideoTransform) {
        expect(createBody.data?.steps?.videoTransform).toBeTruthy();
      }

      // 2. Poll to terminal state
      const job = await pollJob(request, baseURL!, jobId, { 'x-api-key': API_KEY! }, JOB_TIMEOUT_MS);
      expect(['completed', 'failed']).toContain(job.status);

      // 3. Validate each step
      const steps = job.steps || {};

      // Captions step
      if (steps.captions) {
        expect(steps.captions.status).toBe('completed');
        if (steps.captions.url) {
          const artRes = await request.get(steps.captions.url);
          expect(artRes.ok()).toBe(true);
          const text = await artRes.text();
          expect(text.length).toBeGreaterThan(10);
          expect(text).toContain('WEBVTT');
          // Check for degraded flag
          if (steps.captions.degraded) {
            console.warn(`[${preset}] captions degraded`);
          }
        }
      }

      // AD step
      if (steps.ad) {
        expect(steps.ad.status).toBe('completed');
        if (steps.ad.url) {
          const artRes = await request.get(steps.ad.url);
          expect(artRes.ok()).toBe(true);
          const buf = await artRes.body();
          // Real MP3 should be significantly larger than the 8-byte "mock-mp3" stub
          if (steps.ad.degraded) {
            console.warn(`[${preset}] ad degraded (${buf.length} bytes)`);
          } else {
            expect(buf.length).toBeGreaterThan(100);
          }
        }
      }

      // Color step
      if (steps.color) {
        expect(steps.color.status).toBe('completed');
        if (steps.color.url) {
          const artRes = await request.get(steps.color.url);
          expect(artRes.ok()).toBe(true);
          const json = await artRes.json();
          expect(json).toHaveProperty('dominant_colors');
          expect(json).toHaveProperty('contrast_ratio');
          if (steps.color.degraded) {
            console.warn(`[${preset}] color degraded`);
          } else {
            // Real analysis should have actual color data
            expect(json.dominant_colors.length).toBeGreaterThan(0);
          }
        }
      }

      // VideoTransform step (only for presets that declare it)
      if (expectsVideoTransform && steps.videoTransform) {
        expect(steps.videoTransform.status).toBe('completed');
        if (steps.videoTransform.url) {
          const artRes = await request.get(steps.videoTransform.url);
          expect(artRes.ok()).toBe(true);
          const buf = await artRes.body();
          expect(buf.length).toBeGreaterThan(1000);
        }
      }
    });
  }
});
