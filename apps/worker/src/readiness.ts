import 'dotenv/config';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { databaseSslConfig } from '@sinna/types';
import { coreQueuePrefix } from '@sinna/types';
import { heartbeatKey, isFreshReadyHeartbeat } from './heartbeat';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';

async function main(): Promise<void> {
  const missing = [
    'DATABASE_URL', 'REDIS_URL', 'QUEUE_PREFIX', 'WORKER_INSTANCE_ID',
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET',
    'CLOUDINARY_URL', 'ASSEMBLYAI_API_KEY', 'OPENAI_API_KEY',
  ].filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`worker readiness configuration missing: ${missing.join(', ')}`);
  }

  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 1_000,
    ssl: databaseSslConfig(),
  });
  const redis = new IORedis(process.env.REDIS_URL!, {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: 1,
  });

  try {
    await db.query('SELECT 1');
    await redis.connect();
    if (await redis.ping() !== 'PONG') throw new Error('Redis unavailable');

    const configuredHeartbeat = heartbeatKey(coreQueuePrefix(), process.env.WORKER_INSTANCE_ID!);
    if (!isFreshReadyHeartbeat(await redis.get(configuredHeartbeat))) {
      throw new Error('No fresh ready worker heartbeat for WORKER_INSTANCE_ID');
    }
    await access(tmpdir(), constants.R_OK | constants.W_OK);
    await promisify(execFile)('ffmpeg', ['-version'], { timeout: 2_000 });
    console.log(JSON.stringify({
      ok: true,
      checks: {
        configuration: 'up',
        postgres: 'up',
        redis: 'up',
        workerHeartbeat: 'up',
        localMediaRuntime: 'up',
      },
    }));
  } finally {
    await Promise.allSettled([db.end(), redis.quit()]);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : 'worker readiness failed',
  }));
  process.exitCode = 1;
});