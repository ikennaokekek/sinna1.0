import { logger } from './logger';
import { getRedisClient } from '../config/redis';
import { getStripeService } from '../services/stripe';
import { getCloudinaryClient } from '../config/cloudinary';
import { getSentryService } from '../config/sentry';

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  required: boolean;
  details?: any;
}

export interface DoctorReport {
  overall: 'healthy' | 'warning' | 'critical';
  timestamp: string;
  environment: string;
  checks: HealthCheckResult[];
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
}

export class DoctorService {
  
  /**
   * Run comprehensive health checks
   */
  async runDiagnostics(): Promise<DoctorReport> {
    const startTime = Date.now();
    logger.info('Starting system diagnostics...');

    const checks: HealthCheckResult[] = [];
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Environment checks
    checks.push(await this.checkEnvironment());
    checks.push(await this.checkRequiredSecrets());

    // Service checks
    checks.push(await this.checkRedis());
    checks.push(await this.checkStripe());
    checks.push(await this.checkCloudinary());
    checks.push(await this.checkSentry());
    checks.push(await this.checkAIServices());

    // System checks
    checks.push(await this.checkNodeVersion());
    checks.push(await this.checkMemory());
    checks.push(await this.checkDiskSpace());

    // Analyze results
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

    for (const check of checks) {
      if (check.status === 'critical') {
        criticalIssues.push(`${check.service}: ${check.message}`);
        if (check.required) {
          overallStatus = 'critical';
        }
      } else if (check.status === 'warning') {
        warnings.push(`${check.service}: ${check.message}`);
        if (overallStatus === 'healthy') {
          overallStatus = 'warning';
        }
      }
    }

    // Generate recommendations
    if (criticalIssues.length > 0) {
      recommendations.push('Fix critical issues before deploying to production');
    }
    if (warnings.length > 0) {
      recommendations.push('Address warnings to ensure optimal performance');
    }
    if (overallStatus === 'healthy') {
      recommendations.push('System is healthy and ready for production');
    }

    const report: DoctorReport = {
      overall: overallStatus,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      checks,
      criticalIssues,
      warnings,
      recommendations
    };

    const duration = Date.now() - startTime;
    logger.info('System diagnostics completed', {
      duration,
      overallStatus,
      criticalIssues: criticalIssues.length,
      warnings: warnings.length
    });

    return report;
  }

  /**
   * Check environment configuration
   */
  private async checkEnvironment(): Promise<HealthCheckResult> {
    const nodeEnv = process.env.NODE_ENV;
    const port = process.env.PORT;
    const baseUrl = process.env.BASE_URL;

    if (!nodeEnv) {
      return {
        service: 'Environment',
        status: 'warning',
        message: 'NODE_ENV not set',
        required: false
      };
    }

    if (!port) {
      return {
        service: 'Environment',
        status: 'warning',
        message: 'PORT not set, using default',
        required: false
      };
    }

    if (!baseUrl) {
      return {
        service: 'Environment',
        status: 'warning',
        message: 'BASE_URL not set',
        required: false
      };
    }

    return {
      service: 'Environment',
      status: 'healthy',
      message: 'Environment configuration is valid',
      required: true,
      details: { nodeEnv, port, baseUrl }
    };
  }

  /**
   * Check required secrets
   */
  private async checkRequiredSecrets(): Promise<HealthCheckResult> {
    const requiredSecrets = [
      'REDIS_URL',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID', 
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET'
    ];

    const missingSecrets = requiredSecrets.filter(secret => !process.env[secret]);

    if (missingSecrets.length > 0) {
      return {
        service: 'Secrets',
        status: 'critical',
        message: `Missing required secrets: ${missingSecrets.join(', ')}`,
        required: true,
        details: { missing: missingSecrets }
      };
    }

    // Check optional but important secrets
    const optionalSecrets = [
      'ASSEMBLYAI_API_KEY',
      'OPENAI_API_KEY',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'CLOUDINARY_URL',
      'SENTRY_DSN'
    ];

    const missingOptional = optionalSecrets.filter(secret => !process.env[secret]);

    if (missingOptional.length > 0) {
      return {
        service: 'Secrets',
        status: 'warning',
        message: `Missing optional secrets: ${missingOptional.join(', ')}`,
        required: false,
        details: { missingOptional }
      };
    }

    return {
      service: 'Secrets',
      status: 'healthy',
      message: 'All secrets are configured',
      required: true
    };
  }

  /**
   * Check Redis connection
   */
  private async checkRedis(): Promise<HealthCheckResult> {
    try {
      const redisClient = getRedisClient();
      
      if (!redisClient.isClientConnected()) {
        await redisClient.connect();
      }

      const isHealthy = await redisClient.healthCheck();
      
      if (!isHealthy) {
        return {
          service: 'Redis',
          status: 'critical',
          message: 'Redis connection failed',
          required: true
        };
      }

      return {
        service: 'Redis',
        status: 'healthy',
        message: 'Redis connection is healthy',
        required: true
      };

    } catch (error) {
      return {
        service: 'Redis',
        status: 'critical',
        message: `Redis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        required: true
      };
    }
  }

  /**
   * Check Stripe configuration
   */
  private async checkStripe(): Promise<HealthCheckResult> {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        return {
          service: 'Stripe',
          status: 'warning',
          message: 'Stripe not configured - payment features disabled',
          required: false
        };
      }

      const stripeService = getStripeService();
      const isHealthy = await stripeService.healthCheck();

      if (!isHealthy) {
        return {
          service: 'Stripe',
          status: 'warning',
          message: 'Stripe connection failed',
          required: false
        };
      }

      return {
        service: 'Stripe',
        status: 'healthy',
        message: 'Stripe connection is healthy',
        required: false
      };

    } catch (error) {
      return {
        service: 'Stripe',
        status: 'warning',
        message: `Stripe error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        required: false
      };
    }
  }

  /**
   * Check Cloudinary configuration
   */
  private async checkCloudinary(): Promise<HealthCheckResult> {
    try {
      const cloudinaryClient = getCloudinaryClient();
      
      if (!cloudinaryClient.isReady()) {
        return {
          service: 'Cloudinary',
          status: 'warning',
          message: 'Cloudinary not configured - using ffmpeg fallback',
          required: false
        };
      }

      const isHealthy = await cloudinaryClient.healthCheck();

      if (!isHealthy) {
        return {
          service: 'Cloudinary',
          status: 'warning',
          message: 'Cloudinary connection failed - using ffmpeg fallback',
          required: false
        };
      }

      return {
        service: 'Cloudinary',
        status: 'healthy',
        message: 'Cloudinary connection is healthy',
        required: false
      };

    } catch (error) {
      return {
        service: 'Cloudinary',
        status: 'warning',
        message: `Cloudinary error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        required: false
      };
    }
  }

  /**
   * Check Sentry configuration
   */
  private async checkSentry(): Promise<HealthCheckResult> {
    try {
      const sentryService = getSentryService();

      if (!sentryService.isInitialized()) {
        return {
          service: 'Sentry',
          status: 'warning',
          message: 'Sentry not configured - error tracking limited',
          required: false
        };
      }

      return {
        service: 'Sentry',
        status: 'healthy',
        message: 'Sentry is initialized',
        required: false
      };

    } catch (error) {
      return {
        service: 'Sentry',
        status: 'warning',
        message: `Sentry error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        required: false
      };
    }
  }

  /**
   * Check AI services configuration
   */
  private async checkAIServices(): Promise<HealthCheckResult> {
    const hasAssemblyAI = !!process.env.ASSEMBLYAI_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    if (!hasAssemblyAI && !hasOpenAI) {
      return {
        service: 'AI Services',
        status: 'warning',
        message: 'No AI services configured - STT/TTS features limited',
        required: false
      };
    }

    const services = [];
    if (hasAssemblyAI) services.push('AssemblyAI');
    if (hasOpenAI) services.push('OpenAI');

    return {
      service: 'AI Services',
      status: 'healthy',
      message: `AI services configured: ${services.join(', ')}`,
      required: false,
      details: { services }
    };
  }

  /**
   * Check Node.js version
   */
  private async checkNodeVersion(): Promise<HealthCheckResult> {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);

    if (majorVersion < 18) {
      return {
        service: 'Node.js',
        status: 'warning',
        message: `Node.js ${nodeVersion} is outdated, recommend v18+`,
        required: false,
        details: { version: nodeVersion, major: majorVersion }
      };
    }

    return {
      service: 'Node.js',
      status: 'healthy',
      message: `Node.js ${nodeVersion} is supported`,
      required: true,
      details: { version: nodeVersion }
    };
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<HealthCheckResult> {
    const memUsage = process.memoryUsage();
    const totalMemMB = Math.round(memUsage.rss / 1024 / 1024);
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

    if (totalMemMB > 1000) { // > 1GB
      return {
        service: 'Memory',
        status: 'warning',
        message: `High memory usage: ${totalMemMB}MB`,
        required: false,
        details: { rss: totalMemMB, heapUsed: heapUsedMB, heapTotal: heapTotalMB }
      };
    }

    return {
      service: 'Memory',
      status: 'healthy',
      message: `Memory usage: ${totalMemMB}MB`,
      required: false,
      details: { rss: totalMemMB, heapUsed: heapUsedMB, heapTotal: heapTotalMB }
    };
  }

  /**
   * Check disk space (simplified)
   */
  private async checkDiskSpace(): Promise<HealthCheckResult> {
    // Note: In a container environment, disk space checks are limited
    // This is a simplified check
    return {
      service: 'Disk Space',
      status: 'healthy',
      message: 'Disk space check not implemented for container environment',
      required: false
    };
  }

  /**
   * Fail fast check - exit if critical services are down
   */
  async failFastCheck(): Promise<void> {
    logger.info('Running fail-fast health check...');

    const report = await this.runDiagnostics();

    if (report.overall === 'critical') {
      logger.error('Critical issues detected, failing fast:', {
        criticalIssues: report.criticalIssues
      });

      // Print critical issues to console
      console.error('\n🚨 CRITICAL ISSUES DETECTED:');
      report.criticalIssues.forEach(issue => {
        console.error(`❌ ${issue}`);
      });

      console.error('\n💡 RECOMMENDATIONS:');
      report.recommendations.forEach(rec => {
        console.error(`   ${rec}`);
      });

      console.error('\nApplication cannot start with critical issues. Fix them and try again.\n');
      
      process.exit(1);
    }

    if (report.warnings.length > 0) {
      console.warn('\n⚠️  WARNINGS:');
      report.warnings.forEach(warning => {
        console.warn(`   ${warning}`);
      });
    }

    logger.info('Fail-fast check passed', {
      status: report.overall,
      warnings: report.warnings.length
    });
  }
}

// Singleton instance
let doctorService: DoctorService | null = null;

export const getDoctorService = (): DoctorService => {
  if (!doctorService) {
    doctorService = new DoctorService();
  }
  return doctorService;
};
