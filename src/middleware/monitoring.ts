import { Request, Response, NextFunction } from 'express';
import { getSentryService } from '../config/sentry';
import { getMetricsService } from '../services/metrics';
import { logger } from '../utils/logger';

/**
 * Sentry error handling middleware
 */
export const sentryErrorMiddleware = () => {
  const sentryService = getSentryService();
  
  return (error: Error, req: Request, res: Response, next: NextFunction): void => {
    // Capture error in Sentry
    const eventId = sentryService.captureException(error, {
      user: req.user ? {
        id: req.user.id,
        email: req.user.email,
        tenantId: req.user.tenantId
      } : undefined,
      tags: {
        method: req.method,
        route: req.route?.path || req.path,
        userAgent: req.get('User-Agent') || 'unknown'
      },
      extra: {
        body: req.body,
        query: req.query,
        params: req.params,
        headers: req.headers
      },
      level: 'error'
    });

    // Add breadcrumb for debugging
    sentryService.addBreadcrumb({
      message: `HTTP ${req.method} ${req.path} failed`,
      category: 'http',
      level: 'error',
      data: {
        statusCode: res.statusCode,
        error: error.message
      }
    });

    // Log error with event ID
    logger.error('Request failed', {
      error: error.message,
      stack: error.stack,
      sentryEventId: eventId,
      method: req.method,
      path: req.path,
      tenantId: req.user?.tenantId
    });

    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        eventId
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'INTERNAL_ERROR',
        stack: error.stack,
        eventId
      });
    }
  };
};

/**
 * Metrics collection middleware
 */
export const metricsMiddleware = () => {
  const metricsService = getMetricsService();
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const route = req.route?.path || req.path;

    // Track request in flight
    metricsService.httpRequestsInFlight.labels(req.method, route).inc();

    // Override res.end to capture metrics
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const duration = (Date.now() - startTime) / 1000;
      
      // Record HTTP metrics
      metricsService.recordHttpRequest(
        req.method,
        route,
        res.statusCode,
        duration,
        req.user?.tenantId
      );

      // Record API usage by tenant
      if (req.user) {
        metricsService.recordApiUsage(
          req.user.tenantId,
          req.user.subscription?.plan || 'unknown',
          route
        );
      }

      // Decrement in-flight counter
      metricsService.httpRequestsInFlight.labels(req.method, route).dec();

      // Call original end method
      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
};

/**
 * Request logging middleware with Sentry breadcrumbs
 */
export const requestLoggingMiddleware = () => {
  const sentryService = getSentryService();
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    // Set user context in Sentry if available
    if (req.user) {
      sentryService.setUser({
        id: req.user.id,
        email: req.user.email,
        tenantId: req.user.tenantId,
        subscription: req.user.subscription?.plan
      });
    }

    // Add breadcrumb for request
    sentryService.addBreadcrumb({
      message: `HTTP ${req.method} ${req.path}`,
      category: 'http',
      level: 'info',
      data: {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        tenantId: req.user?.tenantId
      }
    });

    // Override res.end to log completion
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const duration = Date.now() - startTime;
      
      // Log request completion
      logger.info('HTTP request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        tenantId: req.user?.tenantId,
        userAgent: req.get('User-Agent')
      });

      // Add completion breadcrumb
      sentryService.addBreadcrumb({
        message: `HTTP ${req.method} ${req.path} completed`,
        category: 'http',
        level: res.statusCode >= 400 ? 'warning' : 'info',
        data: {
          statusCode: res.statusCode,
          duration
        }
      });

      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
};

/**
 * Performance monitoring middleware
 */
export const performanceMiddleware = () => {
  const sentryService = getSentryService();
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const transactionName = `${req.method} ${req.route?.path || req.path}`;
    const transaction = sentryService.startTransaction(transactionName, 'http.server');

    if (transaction) {
      // Set transaction context
      transaction.setTag('http.method', req.method);
      transaction.setTag('http.route', req.route?.path || req.path);
      
      if (req.user) {
        transaction.setTag('tenant.id', req.user.tenantId);
        transaction.setTag('subscription.plan', req.user.subscription?.plan || 'unknown');
      }

      // Override res.end to finish transaction
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: any) {
        transaction.setTag('http.status_code', res.statusCode.toString());
        transaction.setData('http.response.status_code', res.statusCode);
        
        if (res.statusCode >= 400) {
          transaction.setStatus('internal_error');
        } else {
          transaction.setStatus('ok');
        }

        transaction.finish();
        return originalEnd.call(this, chunk, encoding);
      };
    }

    next();
  };
};

/**
 * Health check middleware (lightweight, no tracking)
 */
export const healthCheckMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip monitoring for health checks
    if (req.path === '/health' || req.path === '/ping') {
      return next();
    }
    
    next();
  };
};

/**
 * Usage tracking middleware for paywall integration
 */
export const usageTrackingMiddleware = () => {
  const metricsService = getMetricsService();
  
  return (req: Request, res: Response, next: NextFunction): void => {
    // Track usage limits exceeded from paywall middleware
    if (res.statusCode === 429 && req.user) {
      const limitType = res.locals.limitType || 'unknown';
      metricsService.recordUsageLimitExceeded(
        req.user.tenantId,
        req.user.subscription?.plan || 'unknown',
        limitType
      );
    }

    next();
  };
};
