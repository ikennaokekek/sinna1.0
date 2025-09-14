import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface RedisConfig {
  url: string;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  connectTimeout?: number;
  lazyConnect?: boolean;
}

export class RedisClient {
  private client: Redis;
  private isConnected: boolean = false;

  constructor(config: RedisConfig) {
    const redisOptions: Redis.RedisOptions = {
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      retryDelayOnFailover: config.retryDelayOnFailover || 100,
      connectTimeout: config.connectTimeout || 10000,
      lazyConnect: config.lazyConnect || true,
    };

    // Parse Upstash Redis URL or use direct connection
    if (config.url.startsWith('redis://') || config.url.startsWith('rediss://')) {
      this.client = new Redis(config.url, redisOptions);
    } else {
      throw new Error('Invalid Redis URL format. Must start with redis:// or rediss://');
    }

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis connected successfully');
    });

    this.client.on('ready', () => {
      logger.info('Redis ready for commands');
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      logger.error('Redis connection error', { error });
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis connection closed');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Redis client connected');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      this.isConnected = false;
      logger.info('Redis client disconnected');
    } catch (error) {
      logger.error('Failed to disconnect from Redis', { error });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', { error });
      return false;
    }
  }

  getClient(): Redis {
    return this.client;
  }

  isClientConnected(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }
}

// Singleton instance
let redisClient: RedisClient | null = null;

export const getRedisClient = (): RedisClient => {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }
    
    redisClient = new RedisClient({ url: redisUrl });
  }
  return redisClient;
};
