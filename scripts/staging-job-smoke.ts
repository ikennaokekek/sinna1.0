#!/usr/bin/env tsx
/**
 * One-command staging/production smoke: create a real job and poll until the API
 * reports overall status completed or failed (or timeout).
 *
 * Required env:
 *   TEST_API_KEY or API_KEY
 *
 * Base URL (first non-empty):
 *   STAGING_E2E_BASE_URL, E2E_BASE_URL, API_BASE_URL
 *
 * Optional:
 *   TEST_VIDEO_URL — default public sample MP4 (Big Buck Bunny)
 *   PRESET_ID — default everyday
 *   SMOKE_POLL_INTERVAL_SEC — default 5
 *   SMOKE_POLL_TIMEOUT_SEC — default 600
 *
 * Example:
 *   STAGING_E2E_BASE_URL=https://api.example.com TEST_API_KEY=sk_... pnpm smoke:staging
 */

type JobGetBody = {
  success?: boolean;
  data?: {
    id?: string;
    status?: string;
    steps?: Record<string, { status?: string }>;
    preset?: string;
  };
};

function requireEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    console.error(
      `Missing ${name}. Set TEST_API_KEY or API_KEY, and STAGING_E2E_BASE_URL (or E2E_BASE_URL / API_BASE_URL).`
    );
    process.exit(1);
  }
  return value.trim();
}

function baseUrl(): string {
  const u =
    process.env.STAGING_E2E_BASE_URL ||
    process.env.E2E_BASE_URL ||
    process.env.API_BASE_URL ||
    '';
  return requireEnv('base URL (STAGING_E2E_BASE_URL | E2E_BASE_URL | API_BASE_URL)', u).replace(
    /\/$/,
    ''
  );
}

function apiKey(): string {
  return requireEnv('TEST_API_KEY or API_KEY', process.env.TEST_API_KEY || process.env.API_KEY);
}

const TEST_VIDEO_URL =
  process.env.TEST_VIDEO_URL ||
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const PRESET_ID = process.env.PRESET_ID || 'everyday';
const POLL_SEC = Math.max(1, Number(process.env.SMOKE_POLL_INTERVAL_SEC || '5') || 5);
const TIMEOUT_SEC = Math.max(10, Number(process.env.SMOKE_POLL_TIMEOUT_SEC || '600') || 600);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const base = baseUrl();
  const key = apiKey();

  console.log('Staging job smoke');
  console.log(`  Base URL: ${base}`);
  console.log(`  Preset: ${PRESET_ID}`);
  console.log(`  Video: ${TEST_VIDEO_URL}`);
  console.log(`  Poll: every ${POLL_SEC}s, timeout ${TIMEOUT_SEC}s`);

  const healthRes = await fetch(`${base}/health`, { headers: { 'x-api-key': key } });
  if (!healthRes.ok) {
    console.error(`GET /health failed: HTTP ${healthRes.status}`);
    process.exit(1);
  }

  const createRes = await fetch(`${base}/v1/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify({
      source_url: TEST_VIDEO_URL,
      preset_id: PRESET_ID,
    }),
  });

  const createJson = (await createRes.json()) as JobGetBody & { message?: string };
  if (!createRes.ok || !createJson.success || !createJson.data?.id) {
    console.error('POST /v1/jobs failed:', createRes.status, JSON.stringify(createJson));
    process.exit(1);
  }

  const jobId = createJson.data.id;
  console.log(`  Job id: ${jobId}`);

  const deadline = Date.now() + TIMEOUT_SEC * 1000;
  let last: JobGetBody | null = null;

  while (Date.now() < deadline) {
    const res = await fetch(`${base}/v1/jobs/${jobId}`, {
      headers: { 'x-api-key': key },
    });
    last = (await res.json()) as JobGetBody;

    if (!res.ok || !last.success) {
      console.error('GET /v1/jobs/:id failed:', res.status, JSON.stringify(last));
      process.exit(1);
    }

    const overall = last.data?.status;
    const steps = last.data?.steps;
    const stepSummary = steps
      ? Object.entries(steps)
          .map(([k, v]) => `${k}=${v.status ?? '?'}`)
          .join(', ')
      : '';

    console.log(`  status=${overall}  ${stepSummary}`);

    if (overall === 'completed') {
      console.log('Smoke passed: job completed.');
      process.exit(0);
    }
    if (overall === 'failed') {
      console.error('Smoke failed: job reported failed.');
      console.error(JSON.stringify(last.data, null, 2));
      process.exit(1);
    }

    await sleep(POLL_SEC * 1000);
  }

  console.error('Smoke timed out waiting for completed/failed.');
  if (last?.data) console.error(JSON.stringify(last.data, null, 2));
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
