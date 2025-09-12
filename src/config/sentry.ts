import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { logger } from '../utils/logger';

export interface SentryConfig {
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: number;
  profilesSampleRate?: number;
  debug?: boolean;
}

export class SentryService {
  private initialized: boolean = false;

  constructor(config?: SentryConfig) {
    this.initialize(config);
  }

  private initialize(config?: SentryConfig): void {
    const dsn = config?.dsn || process.env.SENTRY_DSN;
    
    if (!dsn) {
      logger.warn('Sentry DSN not provided - error tracking will be limited');
      return;
    }

    try {
      Sentry.init({
        dsn,
        environment: config?.environment || process.env.NODE_ENV || 'development',
        release: config?.release || process.env.npm_package_version || '1.0.0',
        
        // Performance monitoring
        tracesSampleRate: config?.tracesSampleRate || 0.1, // 10% of transactions
        profilesSampleRate: config?.profilesSampleRate || 0.1, // 10% for profiling
        
        // Integrations
        integrations: [
          // Node.js integrations
          new Sentry.Integrations.Http({ tracing: true }),
          new Sentry.Integrations.Express({ app: undefined }),
          new Sentry.Integrations.RequestData(),
          
          // Profiling
          nodeProfilingIntegration(),
        ],

        // Error filtering
        beforeSend(event, hint) {
          // Filter out certain errors
          if (event.exception) {
            const error = hint.originalException;
            
            // Skip certain error types
            if (error instanceof Error) {
              if (error.message.includes('ECONNRESET') ||
                  error.message.includes('ENOTFOUND') ||
                  error.message.includes('socket hang up')) {
                return null; // Don't send network errors
              }
            }
          }
          
          return event;
        },

        // Add custom tags
        initialScope: {
          tags: {
            component: 'sinna-api',
            service: 'accessibility-api'
          },
          extra: {
            nodeVersion: process.version,
            platform: process.platform
          }
        },

        debug: config?.debug || false,
      });

      this.initialized = true;
      logger.info('Sentry initialized successfully', {
        environment: config?.environment || process.env.NODE_ENV,
        tracesSampleRate: config?.tracesSampleRate || 0.1
      });

    } catch (error) {
      logger.error('Failed to initialize Sentry', { error });
    }
  }

  /**
   * Capture an exception
   */
  captureException(error: Error, context?: {
    user?: { id: string; email?: string; tenantId?: string };
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    level?: Sentry.SeverityLevel;
  }): string | undefined {
    if (!this.initialized) {
      logger.error('Sentry not initialized', { error: error.message });
      return undefined;
    }

    return Sentry.withScope((scope) => {
      if (context?.user) {
        scope.setUser(context.user);
      }
      
      if (context?.tags) {
        Object.entries(context.tags).forEach(([key, value]) => {
          scope.setTag(key, value);
        });
      }
      
      if (context?.extra) {
        Object.entries(context.extra).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
      
      if (context?.level) {
        scope.setLevel(context.level);
      }

      return Sentry.captureException(error);
    });
  }

  /**
   * Capture a message
   */
  captureMessage(
    message: string, 
    level: Sentry.SeverityLevel = 'info',
    context?: {
      user?: { id: string; email?: string; tenantId?: string };
      tags?: Record<string, string>;
      extra?: Record<string, any>;
    }
  ): string | undefined {
    if (!this.initialized) {
      logger.info('Sentry not initialized', { message, level });
      return undefined;
    }

    return Sentry.withScope((scope) => {
      if (context?.user) {
        scope.setUser(context.user);
      }
      
      if (context?.tags) {
        Object.entries(context.tags).forEach(([key, value]) => {
          scope.setTag(key, value);
        });
      }
      
      if (context?.extra) {
        Object.entries(context.extra).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }

      return Sentry.captureMessage(message, level);
    });
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(breadcrumb: {
    message: string;
    category?: string;
    level?: Sentry.SeverityLevel;
    data?: Record<string, any>;
  }): void {
    if (!this.initialized) return;

    Sentry.addBreadcrumb({
      message: breadcrumb.message,
      category: breadcrumb.category || 'custom',
      level: breadcrumb.level || 'info',
      data: breadcrumb.data,
      timestamp: Date.now() / 1000,
    });
  }

  /**
   * Set user context
   */
  setUser(user: {
    id: string;
    email?: string;
    tenantId?: string;
    subscription?: string;
  }): void {
    if (!this.initialized) return;

    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.tenantId,
      subscription: user.subscription,
    });
  }

  /**
   * Set custom tag
   */
  setTag(key: string, value: string): void {
    if (!this.initialized) return;
    Sentry.setTag(key, value);
  }

  /**
   * Set custom context
   */
  setContext(name: string, context: Record<string, any>): void {
    if (!this.initialized) return;
    Sentry.setContext(name, context);
  }

  /**
   * Start a transaction for performance monitoring
   */
  startTransaction(name: string, op: string): Sentry.Transaction | undefined {
    if (!this.initialized) return undefined;
    
    return Sentry.startTransaction({
      name,
      op,
    });
  }

  /**
   * Flush pending events (useful for serverless)
   */
  async flush(timeout: number = 5000): Promise<boolean> {
    if (!this.initialized) return true;
    
    try {
      return await Sentry.flush(timeout);
    } catch (error) {
      logger.error('Failed to flush Sentry events', { error });
      return false;
    }
  }

  /**
   * Health check
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get Sentry client for advanced usage
   */
  getClient(): Sentry.NodeClient | undefined {
    return Sentry.getCurrentHub().getClient() as Sentry.NodeClient;
  }
}

// Singleton instance
let sentryService: SentryService | null = null;

export const getSentryService = (): SentryService => {
  if (!sentryService) {
    sentryService = new SentryService();
  }
  return sentryService;
};

// Export Sentry for direct usage
export { Sentry };
