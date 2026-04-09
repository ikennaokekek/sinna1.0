#!/usr/bin/env tsx
/**
 * Full manual client walkthrough: health → subscription → usage → billing checkout → job(s) with preset(s).
 *
 * Use your tenant API key (sent as x-api-key), not Stripe secrets (sk_test_/sk_live_).
 * Do not paste keys into chat. Export in your shell:
 *
 *   export API_KEY='your-secret-key'
 *   export API_BASE_URL='http://127.0.0.1:4000'   # or your deployed API
 *
 * Optional:
 *   TEST_VIDEO_URL — default Big Buck Bunny sample MP4
 *   PRESETS_CSV — presets to run sequentially (default: everyday). Example: everyday,adhd,low_vision
 *   SKIP_BILLING=1 — skip POST /v1/billing/subscribe
 *   SKIP_JOBS=1 — skip job create + poll (subscription/usage only)
 *   SMOKE_POLL_INTERVAL_SEC, SMOKE_POLL_TIMEOUT_SEC — same as pnpm smoke:staging
 *
 * Run:
 *   pnpm test:manual:client
 */

import * as fs from 'fs';
import * as path from 'path';

type Json = Record<string, unknown>;

function requireEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    console.error(`Missing ${name}. Export API_KEY (or TEST_API_KEY) and API_BASE_URL (or E2E_BASE_URL).`);
    process.exit(1);
  }
  return value.trim();
}

function baseUrl(): string {
  const u =
    process.env.API_BASE_URL ||
    process.env.E2E_BASE_URL ||
    process.env.STAGING_E2E_BASE_URL ||
    '';
  return requireEnv('API_BASE_URL | E2E_BASE_URL', u).replace(/\/$/, '');
}

function apiKey(): string {
  return requireEnv('API_KEY or TEST_API_KEY', process.env.API_KEY || process.env.TEST_API_KEY);
}

const TEST_VIDEO_URL =
  process.env.TEST_VIDEO_URL ||
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

const POLL_SEC = Math.max(1, Number(process.env.SMOKE_POLL_INTERVAL_SEC || '5') || 5);
const TIMEOUT_SEC = Math.max(10, Number(process.env.SMOKE_POLL_TIMEOUT_SEC || '600') || 600);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function section(title: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

function loadPresetIdsFromRepo(): string[] {
  const presetsPath = path.join(__dirname, '..', 'config', 'presets.json');
  try {
    const raw = fs.readFileSync(presetsPath, 'utf-8');
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return Object.keys(obj).sort();
  } catch {
    return [];
  }
}

function parsePresetsCsv(): string[] {
  const csv = (process.env.PRESETS_CSV || 'everyday').trim();
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

type JobBody = {
  success?: boolean;
  data?: {
    id?: string;
    status?: string;
    steps?: Record<string, { status?: string }>;
    preset?: string;
  };
  error?: string;
};

async function pollJob(base: string, key: string, jobId: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_SEC * 1000;
  let last: JobBody | null = null;

  while (Date.now() < deadline) {
    const res = await fetch(`${base}/v1/jobs/${jobId}`, {
      headers: { 'x-api-key': key },
    });
    last = (await res.json()) as JobBody;

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

    console.log(`    status=${overall}  ${stepSummary}`);

    if (overall === 'completed') {
      console.log('    Job completed.');
      return;
    }
    if (overall === 'failed') {
      console.error('    Job failed.');
      console.error(JSON.stringify(last.data, null, 2));
      process.exit(1);
    }

    await sleep(POLL_SEC * 1000);
  }

  console.error('Timed out waiting for job.');
  if (last?.data) console.error(JSON.stringify(last.data, null, 2));
  process.exit(1);
}

async function main(): Promise<void> {
  const base = baseUrl();
  const key = apiKey();
  const skipBilling = process.env.SKIP_BILLING === '1';
  const skipJobs = process.env.SKIP_JOBS === '1';

  console.log('Sinna manual client flow');
  console.log(`  Base URL: ${base}`);
  console.log(`  Video:    ${TEST_VIDEO_URL}`);

  section('1) Tenant identity — GET /health (x-api-key)');
  const healthRes = await fetch(`${base}/health`, { headers: { 'x-api-key': key } });
  const healthText = await healthRes.text();
  console.log(`  HTTP ${healthRes.status}`);
  try {
    console.log('  ', JSON.stringify(JSON.parse(healthText), null, 2).split('\n').join('\n   '));
  } catch {
    console.log('  ', healthText.slice(0, 500));
  }
  if (!healthRes.ok) {
    console.error('Fix API key or server URL; /health must return 200 with your key.');
    process.exit(1);
  }

  section('2) Subscription — GET /v1/me/subscription');
  const subRes = await fetch(`${base}/v1/me/subscription`, { headers: { 'x-api-key': key } });
  console.log(`  HTTP ${subRes.status}`);
  console.log('  ', JSON.stringify(await subRes.json(), null, 2).split('\n').join('\n   '));

  section('3) Usage — GET /v1/me/usage');
  const usageRes = await fetch(`${base}/v1/me/usage`, { headers: { 'x-api-key': key } });
  console.log(`  HTTP ${usageRes.status}`);
  console.log('  ', JSON.stringify(await usageRes.json(), null, 2).split('\n').join('\n   '));
  console.log(
    '  (Note: usage may reflect in-memory demo state unless your tenant is wired through billing webhooks.)'
  );

  if (!skipBilling) {
    section('4) Subscribe as a client — POST /v1/billing/subscribe');
    const billRes = await fetch(`${base}/v1/billing/subscribe`, {
      method: 'POST',
      headers: { 'x-api-key': key },
    });
    const billJson = (await billRes.json()) as Json;
    console.log(`  HTTP ${billRes.status}`);
    console.log('  ', JSON.stringify(billJson, null, 2).split('\n').join('\n   '));
    if (billRes.status === 200 && billJson.data && typeof billJson.data === 'object') {
      const url = (billJson.data as { url?: string }).url;
      if (url) {
        console.log('\n  → Open this URL in a browser to complete Stripe Checkout (test card in Stripe test mode):');
        console.log('   ', url);
      }
    } else if (billRes.status === 503) {
      console.log(
        '\n  Expected locally if Stripe is not configured (STRIPE_SECRET_KEY / STRIPE_STANDARD_PRICE_ID).'
      );
      console.log('  On production/staging with Stripe, you would open the returned checkout URL.');
    }
  } else {
    section('4) Subscribe — skipped (SKIP_BILLING=1)');
  }

  const repoPresets = loadPresetIdsFromRepo();
  if (repoPresets.length) {
    section('Preset IDs available in repo config/presets.json');
    console.log(' ', repoPresets.join(', '));
  }

  if (skipJobs) {
    section('5) Jobs — skipped (SKIP_JOBS=1)');
    console.log('Done (subscription/usage path only).');
    return;
  }

  const presets = parsePresetsCsv();
  section(`5) User runs presets — POST /v1/jobs + poll (${presets.join(', ')})`);

  for (let i = 0; i < presets.length; i++) {
    const presetId = presets[i];
    console.log(`\n  --- Job ${i + 1}/${presets.length}: preset_id=${presetId} ---`);

    const createRes = await fetch(`${base}/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
      },
      body: JSON.stringify({
        source_url: TEST_VIDEO_URL,
        preset_id: presetId,
      }),
    });

    const createJson = (await createRes.json()) as JobBody & { message?: string };
    if (!createRes.ok || !createJson.success || !createJson.data?.id) {
      console.error('  POST /v1/jobs failed:', createRes.status, JSON.stringify(createJson));
      process.exit(1);
    }

    const jobId = createJson.data.id;
    console.log(`  job id: ${jobId}`);
    await pollJob(base, key, jobId);
  }

  section('Done');
  console.log('All requested preset jobs finished with status completed.');
  console.log('Inspect artifacts in GET /v1/jobs/:id responses (URLs) or Swagger: /api-docs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
