import { logger } from './logger';

type ShutdownHandler = () => Promise<void> | void;

export function gracefulShutdown(shutdownHandler: ShutdownHandler): void {
  let shutdownInProgress = false;

  const handleShutdown = async (signal: string) => {
    if (shutdownInProgress) {
      logger.warn(`Received ${signal} during shutdown, forcing exit...`);
      process.exit(1);
    }

    shutdownInProgress = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      await shutdownHandler();
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', { error });
      process.exit(1);
    }
  };

  // Handle different shutdown signals
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGQUIT', () => handleShutdown('SIGQUIT'));

  // Handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception during shutdown', { error });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection during shutdown', { reason, promise });
    process.exit(1);
  });
}
