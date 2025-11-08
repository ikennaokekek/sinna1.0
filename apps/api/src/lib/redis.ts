import IORedis from 'ioredis';

let singleton: IORedis | null = null;

export const redisConnection: IORedis = (() => {
  if (singleton) return singleton;
  const url = process.env.REDIS_URL;
  if (!url) {
    // For testing/development, use a dummy Redis URL to prevent build errors
    // Check if we're in a testing environment or if REDIS_URL is explicitly missing
    if (process.env.NODE_ENV === 'development' || 
        process.env.NODE_ENV === 'test' || 
        process.env.NODE_ENV === undefined ||
        process.env.STRIPE_TESTING === 'true') {
      // Using dummy connection for testing - will fail on actual use
      singleton = new IORedis('redis://localhost:6379', {
        maxRetriesPerRequest: 0,
        enableReadyCheck: false,
        lazyConnect: true,
      });
      return singleton;
    }
    throw new Error('REDIS_URL is required for queue connections');
  }
  singleton = new IORedis(url, {
    maxRetriesPerRequest: 0,
    enableReadyCheck: true,
  });
  return singleton;
})();


