import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

const queueName = 'sinna-jobs';
export const queue = new Queue(queueName, { connection });
export const events = new QueueEvents(queueName, { connection });

new Worker(
  queueName,
  async (job) => {
    // minimal no-op worker
    return { ok: true, jobId: job.id };
  },
  { connection },
);

events.on('completed', ({ jobId }) => {
  console.log('Job completed', jobId);
});

console.log('Worker running for queue', queueName);


