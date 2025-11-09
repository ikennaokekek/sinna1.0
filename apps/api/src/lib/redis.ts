import IORedis from 'ioredis';

let singleton: IORedis | null = null;
let connectionPromise: Promise<IORedis> | null = null;

/**
 * Get or create Redis connection singleton for BullMQ queues
 * This connection is used by all BullMQ queues (captions, ad, color, video-transform)
 */
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
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true, // Connect on first use
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    connectTimeout: 5000,
  });
  
  // Add error handlers (using console for module-level logging)
  singleton.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[Redis Connection] Error:', err.message);
  });
  
  singleton.on('connect', () => {
    // eslint-disable-next-line no-console
    console.log('[Redis Connection] Connected to Redis');
  });
  
  singleton.on('ready', () => {
    // eslint-disable-next-line no-console
    console.log('[Redis Connection] Redis ready for commands');
  });
  
  singleton.on('close', () => {
    // eslint-disable-next-line no-console
    console.warn('[Redis Connection] Connection closed');
  });
  
  return singleton;
})();

/**
 * Verify Redis connection is working
 * Call this during startup to ensure Redis is available before using queues
 */
export async function verifyRedisConnection(): Promise<boolean> {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      try {
        if (!redisConnection.status || redisConnection.status === 'end') {
          await redisConnection.connect();
        }
        // Test connection with PING
        const result = await redisConnection.ping();
        if (result === 'PONG') {
          // eslint-disable-next-line no-console
          console.log('[Redis Connection] ✅ Redis connection verified');
          return redisConnection;
        }
        throw new Error('Redis PING failed');
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error('[Redis Connection] ❌ Redis connection failed:', errMsg);
        throw error;
      }
    })();
  }
  
  try {
    await connectionPromise;
    return true;
  } catch {
    return false;
  }
}


