#!/usr/bin/env tsx
import 'dotenv/config';
import { Queue } from 'bullmq';
import { getRedisClient } from '../src/config/redis';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: tsx scripts/dlq-replay.ts <queueName> <jobId>');
    process.exit(1);
  }

  const [queueName, jobId] = args;
  const dlqName = `${queueName}-dlq`;
  const redis = getRedisClient();
  await redis.connect();

  try {
    const connection = redis.getClient();
    const dlq = new Queue(dlqName, { connection });
    const job = await dlq.getJob(jobId);
    if (!job) {
      console.error(`Job ${jobId} not found in DLQ ${dlqName}`);
      process.exit(2);
    }

    const mainQ = new Queue(queueName, { connection });
    await mainQ.add(job.name, job.data, { attempts: 5, backoff: { type: 'exponential', delay: 2000 } });
    console.log(`Requeued job ${jobId} from ${dlqName} to ${queueName}`);
  } finally {
    await redis.disconnect();
  }
}

main().catch((err) => {
  console.error('DLQ replay failed', err);
  process.exit(1);
});


