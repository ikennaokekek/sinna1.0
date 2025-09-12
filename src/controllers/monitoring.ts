import { Request, Response } from 'express';
import { getSentryService } from '../config/sentry';
import { getMetricsService } from '../services/metrics';
import { getRedisClient } from '../config/redis';
import { getStripeService } from '../services/stripe';
import { getCloudinaryClient } from '../config/cloudinary';
import { logger } from '../utils/logger';

export class MonitoringController {
  private sentryService = getSentryService();
  private metricsService = getMetricsService();

  /**
   * Get Prometheus metrics
   * GET /metrics
   */
  getMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await this.metricsService.getMetrics();
      
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.status(200).send(metrics);

    } catch (error) {
      logger.error('Failed to get metrics', { error });
      res.status(500).send('# Error retrieving metrics\n');
    }
  };

  /**
   * Comprehensive health check
   * GET /health
   */
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {} as Record<string, any>,
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };

    // Check Redis
    try {
      const redisClient = getRedisClient();
      const redisHealthy = await redisClient.healthCheck();
      health.services.redis = {
        status: redisHealthy ? 'healthy' : 'unhealthy',
        connected: redisClient.isClientConnected()
      };
    } catch (error) {
      health.services.redis = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check Stripe
    try {
      const stripeService = getStripeService();
      const stripeHealthy = await stripeService.healthCheck();
      health.services.stripe = {
        status: stripeHealthy ? 'healthy' : 'unhealthy'
      };
    } catch (error) {
      health.services.stripe = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check Cloudinary
    try {
      const cloudinaryClient = getCloudinaryClient();
      const cloudinaryHealthy = await cloudinaryClient.healthCheck();
      health.services.cloudinary = {
        status: cloudinaryHealthy ? 'healthy' : 'unhealthy',
        configured: cloudinaryClient.isReady()
      };
    } catch (error) {
      health.services.cloudinary = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check Sentry
    health.services.sentry = {
      status: this.sentryService.isInitialized() ? 'healthy' : 'not_configured',
      initialized: this.sentryService.isInitialized()
    };

    // Check Metrics
    health.services.metrics = {
      status: this.metricsService.isInitialized() ? 'healthy' : 'unhealthy',
      initialized: this.metricsService.isInitialized()
    };

    // Determine overall health
    const unhealthyServices = Object.values(health.services).filter(
      service => service.status === 'unhealthy'
    );

    if (unhealthyServices.length > 0) {
      health.status = 'degraded';
    }

    // Add response time
    health.responseTime = Date.now() - startTime;

    // Return appropriate status code
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
  };

  /**
   * Simple ping endpoint
   * GET /ping
   */
  ping = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  };

  /**
   * Get system information
   * GET /api/v1/monitoring/system
   */
  getSystemInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const systemInfo = {
        application: {
          name: 'sinna-api',
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          uptime: process.uptime(),
          pid: process.pid
        },
        runtime: {
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        },
        features: {
          sentry: this.sentryService.isInitialized(),
          metrics: this.metricsService.isInitialized(),
          redis: getRedisClient().isClientConnected(),
          cloudinary: getCloudinaryClient().isReady()
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json({
        success: true,
        data: systemInfo,
        message: 'System information retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to get system info', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system information'
      });
    }
  };

  /**
   * Get service statistics
   * GET /api/v1/monitoring/stats
   */
  getServiceStats = async (req: Request, res: Response): Promise<void> => {
    try {
      // Get basic metrics without full Prometheus export
      const stats = {
        requests: {
          total: 'Available in /metrics endpoint',
          rate: 'Available in /metrics endpoint',
          errors: 'Available in /metrics endpoint'
        },
        queues: {
          active: 'Available in /metrics endpoint',
          completed: 'Available in /metrics endpoint',
          failed: 'Available in /metrics endpoint'
        },
        usage: {
          transcription: 'Available in /metrics endpoint',
          audioDescription: 'Available in /metrics endpoint',
          colorAnalysis: 'Available in /metrics endpoint'
        },
        storage: {
          operations: 'Available in /metrics endpoint',
          usage: 'Available in /metrics endpoint'
        },
        timestamp: new Date().toISOString(),
        note: 'For detailed metrics, use the /metrics endpoint with Prometheus'
      };

      res.status(200).json({
        success: true,
        data: stats,
        message: 'Service statistics overview retrieved successfully'
      });

    } catch (error) {
      logger.error('Failed to get service stats', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve service statistics'
      });
    }
  };

  /**
   * Test error reporting (for testing Sentry integration)
   * POST /api/v1/monitoring/test-error
   */
  testError = async (req: Request, res: Response): Promise<void> => {
    try {
      const { type = 'generic', message = 'Test error from monitoring endpoint' } = req.body;

      // Only allow in development
      if (process.env.NODE_ENV === 'production') {
        res.status(403).json({
          success: false,
          error: 'Error testing not allowed in production'
        });
        return;
      }

      let error: Error;

      switch (type) {
        case 'validation':
          error = new Error(`Validation error: ${message}`);
          error.name = 'ValidationError';
          break;
        case 'auth':
          error = new Error(`Authentication error: ${message}`);
          error.name = 'AuthenticationError';
          break;
        case 'rate_limit':
          error = new Error(`Rate limit error: ${message}`);
          error.name = 'RateLimitError';
          break;
        default:
          error = new Error(message);
          error.name = 'TestError';
      }

      // Capture in Sentry
      const eventId = this.sentryService.captureException(error, {
        user: req.user ? {
          id: req.user.id,
          email: req.user.email,
          tenantId: req.user.tenantId
        } : undefined,
        tags: {
          test: 'true',
          errorType: type
        },
        extra: {
          requestBody: req.body,
          testEnvironment: true
        },
        level: 'error'
      });

      res.status(200).json({
        success: true,
        data: {
          eventId,
          errorType: type,
          message,
          sentryInitialized: this.sentryService.isInitialized()
        },
        message: 'Test error captured successfully'
      });

    } catch (error) {
      logger.error('Failed to test error reporting', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to test error reporting'
      });
    }
  };
}
