import { Queue } from 'bullmq';
import IORedis from 'ioredis';

type RemovableQueue = Pick<Queue, 'remove' | 'getJob'>;

export async function removeQueueJobStrict(
  queue: RemovableQueue,
  id: string,
): Promise<void> {
  const removed = await queue.remove(id);
  if (removed === 0 && await queue.getJob(id)) {
    throw new Error(`job ${id} is still present after removal`);
  }
}

export async function removeTenantQueueState(options: {
  tenantId: string;
  redisUrl: string;
  prefix: string;
}): Promise<void> {
  const redis = new IORedis(options.redisUrl, { maxRetriesPerRequest: null });
  const queues = [
    new Queue('video-transform', { connection: redis, prefix: options.prefix }),
    new Queue('captions', { connection: redis, prefix: options.prefix }),
    new Queue('ad', { connection: redis, prefix: options.prefix }),
    new Queue('color', { connection: redis, prefix: options.prefix }),
  ];
  try {
    for (const queue of queues) {
      const jobs = await queue.getJobs(
        ['active', 'waiting', 'waiting-children', 'delayed', 'completed', 'failed', 'paused'],
        0,
        -1,
      );
      for (const job of jobs) {
        if (job.data?.tenantId === options.tenantId && job.id) {
          await removeQueueJobStrict(queue, String(job.id));
        }
      }
    }

    for (const queue of queues) {
      const remaining = await queue.getJobs(
        ['active', 'waiting', 'waiting-children', 'delayed', 'completed', 'failed', 'paused'],
        0,
        -1,
      );
      if (remaining.some((job) => job.data?.tenantId === options.tenantId)) {
        throw new Error(`tenant ${options.tenantId} still has queued or active work`);
      }
    }

    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${options.prefix}:jobs:idempotency:*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      for (const key of keys) {
        const raw = await redis.get(key);
        if (raw && JSON.parse(raw)?.tenantId === options.tenantId) {
          await redis.del(key);
        }
      }
    } while (cursor !== '0');
  } finally {
    for (const queue of queues) await queue.close();
    await redis.quit();
  }
}