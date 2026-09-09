import { readFileSync } from 'node:fs';

const manifest = readFileSync('infra/replit/core-worker-reserved-vm.yaml', 'utf8');
const launcher = readFileSync('infra/replit/run-core-worker.sh', 'utf8');
const build = readFileSync('infra/replit/build-core-worker.sh', 'utf8');
const worker = readFileSync('apps/worker/src/index.ts', 'utf8');
const readiness = readFileSync('apps/worker/src/readiness.ts', 'utf8');
const api = readFileSync('apps/api/src/index.ts', 'utf8');
const queueRuntime = readFileSync('packages/types/src/queueRuntime.ts', 'utf8');
const jobs = readFileSync('apps/api/src/routes/jobs.ts', 'utf8');
const transformFlow = readFileSync('apps/api/src/lib/transformFlow.ts', 'utf8');
const accounting = readFileSync('apps/worker/src/completionAccounting.ts', 'utf8');
const audioDescription = readFileSync('apps/worker/src/audioDescription.ts', 'utf8');

for (const value of [
  'deploymentType: reserved-vm', 'alwaysOn: true', 'publicIngress: false',
  'httpListener: false', 'launchesCoreApi: false', 'implicitMigrations: false',
  'buildCommand: bash infra/replit/build-core-worker.sh',
  'runCommand: bash infra/replit/run-core-worker.sh',
  'readinessCommand: node apps/worker/dist/readiness.js',
  'queueNamespaceEnvironment: QUEUE_PREFIX', 'attempts: 5', 'strategy: exponential',
  'initialDelayMs: 5000', 'timeoutEnvironment: WORKER_SHUTDOWN_TIMEOUT_MS',
  'transformPrerequisites: bullmq-flow-children', 'failedPrerequisite: fail-parent',
  'timing: before-bullmq-completion', 'queue-name', 'job-id',
  'postgresql', 'redis', 'ffmpeg', 's3-compatible-object-store',
  'ASSEMBLYAI_API_KEY', 'OPENAI_API_KEY', 'CLOUDINARY_URL',
  'SESSION_SECRET', 'REPLIT_SYNC_SECRET', 'STRIPE_SECRET_KEY',
  'http-api', 'checkout', 'plaintext-api-key-delivery', 'schema-migration',
]) if (!manifest.includes(value)) throw new Error(`worker Reserved VM contract missing: ${value}`);

for (const value of [
  'QUEUE_PREFIX is required', 'WORKER_INSTANCE_ID is required',
  'WORKER_CONCURRENCY is required', 'WORKER_SHUTDOWN_TIMEOUT_MS is required',
  'exec node apps/worker/dist/index.js',
]) if (!launcher.includes(value)) throw new Error(`worker launcher missing: ${value}`);

if (/\bmigrat(e|ion)/i.test(launcher) || /\bmigrat(e|ion)/i.test(build)) {
  throw new Error('worker build/start must never run migrations');
}
if (/apps\/api\/dist|pnpm start|fastify|listen\(/i.test(launcher)) {
  throw new Error('worker launcher must not start API or HTTP responsibilities');
}
for (const value of ['prefix: queuePrefix', "worker.on('failed'", "worker.on('stalled'", 'worker_draining']) {
  if (!worker.includes(value)) throw new Error(`worker runtime invariant missing: ${value}`);
}
for (const value of ['heartbeatKey(coreQueuePrefix()', "execFile)('ffmpeg'", 'No fresh ready worker heartbeat']) {
  if (!readiness.includes(value)) throw new Error(`worker readiness invariant missing: ${value}`);
}
if (!api.includes('prefix: coreQueuePrefix()') || !api.includes('defaultJobOptions: coreQueueRetryOptions')) {
  throw new Error('API queue producers must share namespace and retry policy');
}
if (!queueRuntime.includes('attempts: 5') || !queueRuntime.includes("type: 'exponential'")) {
  throw new Error('shared queue retry policy missing');
}
for (const value of ['queues.flow.add(transformFlow.definition)', 'createTransformFlow']) {
  if (!jobs.includes(value)) throw new Error(`durable flow invocation invariant missing: ${value}`);
}
for (const value of ['captionJobId: childIds.captions', 'adJobId: childIds.ad', 'jobId: childIds.captions', 'jobId: childIds.ad', 'failParentOnFailure: true']) {
  if (!transformFlow.includes(value)) throw new Error(`atomic flow invariant missing: ${value}`);
}
if (jobs.includes('flow.job.updateData')) throw new Error('transform prerequisite IDs must not be added after flow creation');
if (audioDescription.includes('fallback') || audioDescription.includes('catch')) throw new Error('audio-description provider failures must propagate to BullMQ');
for (const value of ['db.connect()', 'client.release()', 'worker_job_completions', 'ON CONFLICT (queue_name, job_id) DO NOTHING', 'BEGIN', 'COMMIT', 'ROLLBACK']) {
  if (!accounting.includes(value)) throw new Error(`completion accounting invariant missing: ${value}`);
}
console.log('core worker Reserved VM contract valid');