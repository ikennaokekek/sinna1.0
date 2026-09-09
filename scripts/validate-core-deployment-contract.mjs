import { readFileSync } from 'node:fs';

const path = 'infra/replit/core-deployment-units.yaml';
const manifest = readFileSync(path, 'utf8');
const renderPath = process.env.CORE_RENDER_CONTRACT_PATH || 'render.yaml';
const promotionPath = process.env.CORE_PROMOTION_WORKFLOW_PATH || '.github/workflows/production-promotion.yaml';
const readmePath = process.env.CORE_README_PATH || 'README.md';
const watchdogReadmePath = process.env.CORE_WATCHDOG_README_PATH || 'scripts/WATCHDOG_README.md';
const units = [...manifest.matchAll(/^  - name: (.+)$/gm)].map((match) => match[1]);
if (units.length !== 2 || units.join(',') !== 'core-api,core-worker') {
  throw new Error('deployment contract must define exactly core-api and core-worker');
}
const required = [
  'liveDeploymentMutation: false', 'projectIsolation: dedicated-replit-project-per-unit',
  'sameRevisionForAllUnits: true',
  'runtimeRevisionVariable: REVISION',
  'name: core-api', 'target: autoscale', 'publicIngress: true',
  'portEnvironment: PORT', 'livenessPath: /health', 'readinessPath: /readiness',
  'buildCommand: bash infra/replit/build-core-api.sh', 'runCommand: bash infra/replit/run-core-api.sh',
  'name: core-worker', 'target: vm', 'vmClass: Reserved VM', 'alwaysOn: true', 'publicIngress: false',
  'readinessCommand: node apps/worker/dist/readiness.js',
  'queueNamespaceEnvironment: QUEUE_PREFIX',
  'runtimeContract: infra/replit/core-worker-reserved-vm.yaml',
  'buildCommand: bash infra/replit/build-core-worker.sh', 'runCommand: bash infra/replit/run-core-worker.sh',
  's3-compatible-object-store', 'core-api-runtime', 'core-sync-verifier',
  'core-worker-runtime', 'core-worker-providers', 'excludedServices:', '- onboarding',
];
for (const value of required) if (!manifest.includes(value)) throw new Error(`deployment contract missing: ${value}`);
for (const file of ['infra/replit/build-core-api.sh', 'infra/replit/build-core-worker.sh', 'infra/replit/run-core-api.sh', 'infra/replit/run-core-worker.sh']) {
  const content = readFileSync(file, 'utf8');
  if (/\bmigrat(e|ion)/i.test(content)) throw new Error(`${file} must not run migrations`);
  if (file.includes('/build-') && !content.includes('pnpm@10.26.1 install --frozen-lockfile')) throw new Error(`${file} must use the frozen pinned install`);
  if (file.includes('/run-') && (
    !content.includes('exec node apps/') ||
    /\bpnpm (install|i)\b/.test(content) ||
    !content.includes('REVISION is required') ||
    !content.includes('DATABASE_SSL_MODE is required') ||
    !content.includes('[0-9a-f]{40}')
  )) throw new Error(`${file} must require an exact revision and exec compiled output without installing`);
}
const api = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
const worker = JSON.parse(readFileSync('apps/worker/package.json', 'utf8'));
for (const dependency of ['fastify', 'bullmq', 'ioredis', 'pg']) {
  if (!api.dependencies[dependency]) throw new Error(`API dependency missing: ${dependency}`);
}
for (const dependency of ['bullmq', 'ioredis', 'pg']) {
  if (!worker.dependencies[dependency]) throw new Error(`worker dependency missing: ${dependency}`);
}
const render = readFileSync(renderPath, 'utf8');
const renderServices = render.split(/\n(?=  - type: )/).filter((block) => /^  - type: /m.test(block));
if (renderServices.length === 0) throw new Error('legacy Render blueprint must contain explicitly disabled services');
for (const service of renderServices) {
  const name = service.match(/^    name: (.+)$/m)?.[1] || 'unnamed';
  if (!/^    autoDeploy: false$/m.test(service)) throw new Error(`legacy Render service must remain manual-only: ${name}`);
}
const promotion = readFileSync(promotionPath, 'utf8');
for (const value of [
  'checks: read',
  'verify-staging-revision:',
  'github.rest.checks.listForRef',
  "check.name === 'integration-e2e-staging'",
  "check.conclusion === 'success'",
  'needs: verify-staging-revision',
  'environment: production',
]) {
  if (!promotion.includes(value)) throw new Error(`production promotion staging gate missing: ${value}`);
}
const readme = readFileSync(readmePath, 'utf8');
if (/Deploy to Render \(Recommended\)|render\.yaml automatically configures|Monitors Render logs/i.test(readme)) {
  throw new Error('README must not recommend or imply active Render deployment');
}
const watchdogReadme = readFileSync(watchdogReadmePath, 'utf8');
if (!watchdogReadme.includes('Archived legacy Render watchdog')) {
  throw new Error('legacy Render watchdog documentation must remain explicitly archived');
}
console.log('core deployment contract valid');