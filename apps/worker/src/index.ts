import 'dotenv/config';
import { validateEnv } from '@sinna/types';
try {
  validateEnv(process.env);
} catch (e: any) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration (worker):', e?.message || e);
  process.exit(1);
}
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';

const redisUrl = process.env.REDIS_URL;
let connection: IORedis | null = null;
if (redisUrl) {
  const client = new IORedis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableReadyCheck: false,
    retryStrategy: () => null,
    connectTimeout: 1000,
  } as any);
  client.connect().then(() => {
    console.log('Worker Redis connected');
  }).catch((e) => {
    console.warn('Worker Redis unavailable, running without queues', e?.message || e);
  });
  connection = client as any;
} else {
  console.warn('REDIS_URL not set; worker will idle');
}

// Process the three API queues
const qNames = ['captionsQ', 'adQ', 'colorQ'] as const;
const queues = connection ? qNames.map((n) => new Queue(n, { connection })) : [];
const events = connection ? qNames.map((n) => new QueueEvents(n, { connection })) : [];

// Minimal DB client for usage updates
const databaseUrl = process.env.DATABASE_URL;
const db = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined as any,
    })
  : null;

if (connection) {
  for (const name of qNames) {
    new Worker(
      name,
      async (job) => {
        // minimal no-op worker
        const minutes = Number((job.data && job.data.estimatedMinutes) || 0);
        const egressBytes = Number((job.data && job.data.egressBytes) || 0);
        return { ok: true, jobId: job.id, tenantId: job.data?.tenantId, minutes, egressBytes };
      },
      { connection },
    );
  }
}

for (const ev of events) {
  ev.on('completed', async ({ jobId, returnvalue }) => {
    try {
      console.log('Job completed', jobId);
      if (!db) return;

      const payload: any = typeof returnvalue === 'string'
        ? (() => { try { return JSON.parse(returnvalue as unknown as string); } catch { return {}; } })()
        : (returnvalue as any) || {};

      const tenantId = (payload && payload.tenantId) as string | undefined;
      if (!tenantId) return;

      const minutes = Number((payload && payload.minutes) || 0);
      const egressBytes = Number((payload && payload.egressBytes) || 0);

      await db.query(
        `insert into usage_counters(tenant_id, period_start, minutes_used, jobs, egress_bytes)
         values ($1, date_trunc('month', now())::date, 0, 0, 0)
         on conflict (tenant_id) do nothing`,
        [tenantId]
      );
      await db.query(
        `update usage_counters set minutes_used = minutes_used + $2, egress_bytes = egress_bytes + $3 where tenant_id = $1`,
        [tenantId, minutes, egressBytes]
      );
    } catch (e) {
      console.error('Failed to update usage on completion', e);
    }
  });
}

console.log('Worker running for queues', qNames.join(', '));


