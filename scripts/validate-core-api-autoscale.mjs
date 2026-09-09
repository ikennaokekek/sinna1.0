import { readFileSync } from 'node:fs';

const manifest = readFileSync('infra/replit/core-api-autoscale.yaml', 'utf8');

export function manifestList(manifestText, section) {
  const match = new RegExp(`^${section}:\\n((?:  - [^\\n]+\\n?)*)`, 'm').exec(manifestText);
  if (!match) throw new Error(`Autoscale contract missing list: ${section}`);
  return match[1]
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(4));
}

export function validateProductionStripeSecrets(manifestText) {
  const requiredSecrets = manifestList(manifestText, 'requiredSecrets');
  const conditionalSecrets = manifestList(manifestText, 'conditionalSecrets');
  for (const secret of ['STRIPE_SECRET_KEY_LIVE', 'STRIPE_WEBHOOK_SECRET_LIVE']) {
    if (!conditionalSecrets.includes(secret)) {
      throw new Error(`conditional API secret missing: ${secret}`);
    }
  }
  for (const secret of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
    if ([...requiredSecrets, ...conditionalSecrets].includes(secret)) {
      throw new Error(`generic Stripe secret prohibited in production API contract: ${secret}`);
    }
  }
}
const required = [
  'liveDeploymentMutation: false',
  'service: core-api',
  'projectBoundary: dedicated-replit-project',
  'target: autoscale',
  'publicIngress: true',
  'bindHost: 0.0.0.0',
  'portEnvironment: PORT',
  'startupResponseDeadlineMs: 5000',
  'absoluteStartupDeadlineMs: 4500',
  'postgresStartupProbeDeadlineMs: 2000',
  'scaleToZeroSafe: true',
  'backgroundConsumers: false',
  'runtimeStateAllowed: false',
  'buildCommand: bash infra/replit/build-core-api.sh',
  'runCommand: bash infra/replit/run-core-api.sh',
  'livenessPath: /health',
  'readinessPath: /readiness',
  'explicitApprovedOperationOnly: true',
];
for (const value of required) {
  if (!manifest.includes(value)) throw new Error(`Autoscale contract missing: ${value}`);
}

for (const secret of [
  'DATABASE_URL',
  'REDIS_URL',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'REPLIT_SYNC_SECRET',
]) {
  if (!manifest.includes(`  - ${secret}`))
    throw new Error(`required API secret missing: ${secret}`);
}
for (const secret of [
  'SESSION_SECRET',
  'CLOUDINARY_URL',
  'ASSEMBLYAI_API_KEY',
  'OPENAI_API_KEY',
  'OPEN_ROUTER_QWEN_KEY',
  'WORKER_INSTANCE_ID',
]) {
  if (!manifest.includes(`  - ${secret}`))
    throw new Error(`prohibited API secret missing: ${secret}`);
}
validateProductionStripeSecrets(manifest);

const build = readFileSync('infra/replit/build-core-api.sh', 'utf8');
const run = readFileSync('infra/replit/run-core-api.sh', 'utf8');
for (const [name, content] of [
  ['build', build],
  ['run', run],
]) {
  if (/\bmigrat(e|ion)/i.test(content)) throw new Error(`${name} command must not run migrations`);
}
if (!build.includes('pnpm@10.26.1 install --frozen-lockfile')) {
  throw new Error('API build must use the pinned frozen install');
}
for (const value of [
  'PORT is required',
  'PORT must be an integer between 1 and 65535',
  'DB_POOL_MAX is required',
  'DB_POOL_MIN is required',
  'QUEUE_PREFIX is required',
  'REVISION is required',
  'DATABASE_SSL_MODE is required',
  'exec node apps/api/dist/index.js',
]) {
  if (!run.includes(value)) throw new Error(`API launcher missing: ${value}`);
}
if (
  !readFileSync('apps/api/src/index.ts', 'utf8').includes(
    "await app.listen({ port, host: '0.0.0.0' })",
  )
) {
  throw new Error('API must bind to 0.0.0.0 and the configured PORT');
}
const database = readFileSync('apps/api/src/lib/db.ts', 'utf8');
for (const value of [
  'timeoutMs = 2_000',
  'query_timeout: timeoutMs',
  "withDeadline(query(), timeoutMs, 'PostgreSQL health check deadline exceeded')",
]) {
  if (!database.includes(value))
    throw new Error(`bounded PostgreSQL startup probe missing: ${value}`);
}
const startupDeadline = readFileSync('apps/api/src/lib/startupDeadline.ts', 'utf8');
for (const value of ['API_STARTUP_DEADLINE_MS = 4_500', 'Core API startup deadline exceeded']) {
  if (!startupDeadline.includes(value))
    throw new Error(`absolute API startup deadline missing: ${value}`);
}
const apiIndex = readFileSync('apps/api/src/index.ts', 'utf8');
if (!apiIndex.includes('runWithinApiStartupDeadline(start).catch')) {
  throw new Error('API start must be wrapped by the absolute startup deadline');
}
const step7 = readFileSync('docs/CORE_API_REPLIT_STEP7.md', 'utf8');
if (!step7.includes('`CORS_ORIGINS`, `QUEUE_PREFIX`')) {
  throw new Error('Step 7 required configuration must document QUEUE_PREFIX');
}
console.log('core API Autoscale contract valid');
