#!/usr/bin/env node

/**
 * Sinna API Server
 * Advanced accessibility features API for streaming platforms
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// Services and utilities
import { logger } from './utils/logger';
import { getDoctorService } from './utils/doctor';
import { getSentryService } from './config/sentry';
import { getMetricsService } from './services/metrics';
import { getRedisClient } from './config/redis';
import { QueueService } from './services/queue';
import { SpeechToTextService } from './services/speechToText';
import { TextToSpeechService } from './services/textToSpeech';
import { MediaProcessingService } from './services/mediaProcessing';
import { StorageService } from './services/storage';
import { R2Client } from './config/r2';

// Controllers
import { StorageController } from './controllers/storage';
import { JobsController } from './controllers/jobs';
import { AccessibilityController } from './controllers/accessibility';
import { AudioServicesController } from './controllers/audioServices';
import { BillingController } from './controllers/billing';
import { MonitoringController } from './controllers/monitoring';

// Routes
import { createStorageRoutes } from './routes/storage';
import { createJobsRoutes } from './routes/jobs';
import { createAccessibilityRoutes } from './routes/accessibility';
import { createAudioServicesRoutes } from './routes/audioServices';
import { createBillingRoutes } from './routes/billing';
import { createMonitoringRoutes } from './routes/monitoring';

// Middleware
import { 
  sentryErrorMiddleware, 
  metricsMiddleware, 
  requestLoggingMiddleware,
  performanceMiddleware,
  healthCheckMiddleware,
  usageTrackingMiddleware
} from './middleware/monitoring';
import { usageReportingMiddleware } from './middleware/paywall';

async function startServer(): Promise<void> {
  try {
    // Run fail-fast health check
    const doctorService = getDoctorService();
    await doctorService.failFastCheck();

    logger.info('Starting Sinna API Server...');

    // Initialize services
    const sentryService = getSentryService();
    const metricsService = getMetricsService();
    
    // Connect to Redis
    const redisClient = getRedisClient();
    await redisClient.connect();

    // Initialize queue service
    const queueService = new QueueService();

    // Initialize AI services
    const sttService = new SpeechToTextService();
    const ttsService = new TextToSpeechService();
    const mediaProcessingService = new MediaProcessingService();

    // Initialize storage service
    const r2Client = new R2Client({
      accountId: process.env.R2_ACCOUNT_ID!,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      bucket: process.env.R2_BUCKET!
    });
    const storageService = new StorageService(r2Client);

    // Initialize controllers
    const storageController = new StorageController(storageService);
    const jobsController = new JobsController(queueService);
    const accessibilityController = new AccessibilityController(mediaProcessingService, queueService);
    const audioServicesController = new AudioServicesController(sttService, ttsService, queueService);
    const billingController = new BillingController();
    const monitoringController = new MonitoringController();

    // Create Express app
    const app = express();
    const port = process.env.PORT || 3002;

    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: false, // Disable for Swagger UI
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    app.use(cors({
      origin: process.env.NODE_ENV === 'production' ? 
        [process.env.BASE_URL || 'http://localhost:3002'] : 
        true,
      credentials: true
    }));

    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Monitoring middleware (applied to all routes)
    app.use(healthCheckMiddleware());
    app.use(requestLoggingMiddleware());
    app.use(metricsMiddleware());
    app.use(performanceMiddleware());
    app.use(usageReportingMiddleware());
    app.use(usageTrackingMiddleware());

    // API Documentation
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'Sinna API',
          version: '1.0.0',
          description: 'Advanced accessibility features API for streaming platforms',
          contact: {
            name: 'Sinna Team',
            email: 'support@sinna.com'
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
          }
        },
        servers: [
          {
            url: process.env.BASE_URL || 'http://localhost:3002',
            description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
          }
        ],
        components: {
          securitySchemes: {
            ApiKeyAuth: {
              type: 'apiKey',
              in: 'header',
              name: 'x-api-key',
              description: 'API key for authentication'
            }
          }
        },
        security: [
          {
            ApiKeyAuth: []
          }
        ]
      },
      apis: ['./src/routes/*.ts'], // Path to the API files
    };

    const swaggerSpec = swaggerJSDoc(swaggerOptions);

    // Swagger UI
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Sinna API Documentation'
    }));

    // API Routes
    app.use('/api/v1/storage', createStorageRoutes(storageController));
    app.use('/api/v1/jobs', createJobsRoutes(jobsController));
    app.use('/api/v1/accessibility', createAccessibilityRoutes(accessibilityController));
    app.use('/api/v1/audio', createAudioServicesRoutes(audioServicesController));
    app.use('/api/v1/billing', createBillingRoutes(billingController));

    // Monitoring routes (includes /health, /ping, /metrics)
    app.use('/', createMonitoringRoutes(monitoringController));

    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        name: 'Sinna API',
        version: '1.0.0',
        description: 'Advanced accessibility features API for streaming platforms',
        documentation: `${req.protocol}://${req.get('host')}/api-docs`,
        health: `${req.protocol}://${req.get('host')}/health`,
        metrics: `${req.protocol}://${req.get('host')}/metrics`,
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.originalUrl,
        method: req.method
      });
    });

    // Error handling middleware (must be last)
    app.use(sentryErrorMiddleware());

    // Start server
    const server = app.listen(port, () => {
      logger.info('Sinna API Server started successfully', {
        port,
        environment: process.env.NODE_ENV || 'development',
        documentation: `http://localhost:${port}/api-docs`,
        health: `http://localhost:${port}/health`,
        metrics: `http://localhost:${port}/metrics`,
        pid: process.pid,
        nodeVersion: process.version
      });

      // Log service status
      logger.info('Service status', {
        redis: redisClient.isClientConnected(),
        sentry: sentryService.isInitialized(),
        metrics: metricsService.isInitialized()
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      server.close(async () => {
        try {
          await redisClient.disconnect();
          await queueService.shutdown();
          await sentryService.flush();
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error });
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

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Server startup failed', { error });
    process.exit(1);
  });
}

export { startServer };
