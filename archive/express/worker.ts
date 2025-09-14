#!/usr/bin/env node

/**
 * Sinna API Worker Process
 * Handles background job processing for accessibility features
 */

import 'dotenv/config';
import { getRedisClient } from './config/redis';
import { QueueService } from './services/queue';
import { logger } from './utils/logger';
import { gracefulShutdown } from './utils/gracefulShutdown';

async function startWorker(): Promise<void> {
  try {
    logger.info('Starting Sinna API Worker...');

    // Initialize Redis connection
    const redisClient = getRedisClient();
    await redisClient.connect();

    // Health check Redis
    const isRedisHealthy = await redisClient.healthCheck();
    if (!isRedisHealthy) {
      throw new Error('Redis health check failed');
    }

    // Initialize queue service and workers
    const queueService = new QueueService();
    queueService.initializeWorkers();

    logger.info('Worker started successfully', {
      pid: process.pid,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    });

    // Setup graceful shutdown
    gracefulShutdown(async () => {
      logger.info('Shutting down worker...');
      await queueService.shutdown();
      await redisClient.disconnect();
      logger.info('Worker shutdown complete');
    });

    // Keep the process alive
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start worker', { error });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

// Start the worker if this file is run directly
if (require.main === module) {
  startWorker().catch((error) => {
    logger.error('Worker startup failed', { error });
    process.exit(1);
  });
}
