import IORedis from 'ioredis';

let singleton: IORedis | null = null;

export const redisConnection: IORedis = (() => {
  if (singleton) return singleton;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is required for queue connections');
  }
  singleton = new IORedis(url, {
    maxRetriesPerRequest: 0,
    enableReadyCheck: true,
  } as any);
  return singleton;
})();


