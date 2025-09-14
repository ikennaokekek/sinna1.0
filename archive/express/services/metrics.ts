import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from '../utils/logger';

export class MetricsService {
  private initialized: boolean = false;

  // API Metrics
  public httpRequestsTotal: Counter<string>;
  public httpRequestDuration: Histogram<string>;
  public httpRequestsInFlight: Gauge<string>;

  // Business Metrics
  public transcriptionRequestsTotal: Counter<string>;
  public transcriptionDuration: Histogram<string>;
  public audioDescriptionRequestsTotal: Counter<string>;
  public colorAnalysisRequestsTotal: Counter<string>;
  public subtitleGenerationTotal: Counter<string>;

  // System Metrics
  public queueJobsTotal: Counter<string>;
  public queueJobDuration: Histogram<string>;
  public queueJobsActive: Gauge<string>;
  public queueJobsFailed: Counter<string>;

  // Usage Metrics
  public apiUsageByTenant: Counter<string>;
  public subscriptionStatus: Gauge<string>;
  public usageLimitsExceeded: Counter<string>;

  // Storage Metrics
  public storageOperationsTotal: Counter<string>;
  public storageOperationDuration: Histogram<string>;
  public storageUsageBytes: Gauge<string>;

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    try {
      // Collect default Node.js metrics
      collectDefaultMetrics({
        register,
        prefix: 'sinna_',
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
      });

      // API Metrics
      this.httpRequestsTotal = new Counter({
        name: 'sinna_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status_code', 'tenant_id'],
        registers: [register],
      });

      this.httpRequestDuration = new Histogram({
        name: 'sinna_http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route', 'status_code'],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
        registers: [register],
      });

      this.httpRequestsInFlight = new Gauge({
        name: 'sinna_http_requests_in_flight',
        help: 'Number of HTTP requests currently being processed',
        labelNames: ['method', 'route'],
        registers: [register],
      });

      // Business Metrics
      this.transcriptionRequestsTotal = new Counter({
        name: 'sinna_transcription_requests_total',
        help: 'Total number of transcription requests',
        labelNames: ['provider', 'language', 'tenant_id', 'status'],
        registers: [register],
      });

      this.transcriptionDuration = new Histogram({
        name: 'sinna_transcription_duration_seconds',
        help: 'Duration of transcription requests in seconds',
        labelNames: ['provider', 'language'],
        buckets: [1, 5, 10, 30, 60, 120, 300, 600],
        registers: [register],
      });

      this.audioDescriptionRequestsTotal = new Counter({
        name: 'sinna_audio_description_requests_total',
        help: 'Total number of audio description requests',
        labelNames: ['provider', 'language', 'tenant_id', 'status'],
        registers: [register],
      });

      this.colorAnalysisRequestsTotal = new Counter({
        name: 'sinna_color_analysis_requests_total',
        help: 'Total number of color analysis requests',
        labelNames: ['provider', 'tenant_id', 'status'],
        registers: [register],
      });

      this.subtitleGenerationTotal = new Counter({
        name: 'sinna_subtitle_generation_total',
        help: 'Total number of subtitle generation requests',
        labelNames: ['format', 'language', 'tenant_id', 'status'],
        registers: [register],
      });

      // System Metrics
      this.queueJobsTotal = new Counter({
        name: 'sinna_queue_jobs_total',
        help: 'Total number of queue jobs processed',
        labelNames: ['queue_name', 'status'],
        registers: [register],
      });

      this.queueJobDuration = new Histogram({
        name: 'sinna_queue_job_duration_seconds',
        help: 'Duration of queue jobs in seconds',
        labelNames: ['queue_name'],
        buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800],
        registers: [register],
      });

      this.queueJobsActive = new Gauge({
        name: 'sinna_queue_jobs_active',
        help: 'Number of active jobs in queues',
        labelNames: ['queue_name'],
        registers: [register],
      });

      this.queueJobsFailed = new Counter({
        name: 'sinna_queue_jobs_failed_total',
        help: 'Total number of failed queue jobs',
        labelNames: ['queue_name', 'error_type'],
        registers: [register],
      });

      // Usage Metrics
      this.apiUsageByTenant = new Counter({
        name: 'sinna_api_usage_by_tenant_total',
        help: 'Total API usage by tenant',
        labelNames: ['tenant_id', 'plan', 'feature'],
        registers: [register],
      });

      this.subscriptionStatus = new Gauge({
        name: 'sinna_subscription_status',
        help: 'Subscription status by tenant (1=active, 0=inactive)',
        labelNames: ['tenant_id', 'plan'],
        registers: [register],
      });

      this.usageLimitsExceeded = new Counter({
        name: 'sinna_usage_limits_exceeded_total',
        help: 'Total number of usage limit exceeded events',
        labelNames: ['tenant_id', 'plan', 'limit_type'],
        registers: [register],
      });

      // Storage Metrics
      this.storageOperationsTotal = new Counter({
        name: 'sinna_storage_operations_total',
        help: 'Total number of storage operations',
        labelNames: ['operation', 'provider', 'status'],
        registers: [register],
      });

      this.storageOperationDuration = new Histogram({
        name: 'sinna_storage_operation_duration_seconds',
        help: 'Duration of storage operations in seconds',
        labelNames: ['operation', 'provider'],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
        registers: [register],
      });

      this.storageUsageBytes = new Gauge({
        name: 'sinna_storage_usage_bytes',
        help: 'Current storage usage in bytes',
        labelNames: ['tenant_id', 'provider', 'content_type'],
        registers: [register],
      });

      this.initialized = true;
      logger.info('Metrics service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize metrics service', { error });
    }
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    tenantId?: string
  ): void {
    if (!this.initialized) return;

    this.httpRequestsTotal
      .labels(method, route, statusCode.toString(), tenantId || 'unknown')
      .inc();

    this.httpRequestDuration
      .labels(method, route, statusCode.toString())
      .observe(duration);
  }

  /**
   * Record transcription metrics
   */
  recordTranscription(
    provider: string,
    language: string,
    duration: number,
    tenantId: string,
    status: 'success' | 'error'
  ): void {
    if (!this.initialized) return;

    this.transcriptionRequestsTotal
      .labels(provider, language, tenantId, status)
      .inc();

    if (status === 'success') {
      this.transcriptionDuration
        .labels(provider, language)
        .observe(duration);
    }
  }

  /**
   * Record audio description metrics
   */
  recordAudioDescription(
    provider: string,
    language: string,
    tenantId: string,
    status: 'success' | 'error'
  ): void {
    if (!this.initialized) return;

    this.audioDescriptionRequestsTotal
      .labels(provider, language, tenantId, status)
      .inc();
  }

  /**
   * Record color analysis metrics
   */
  recordColorAnalysis(
    provider: string,
    tenantId: string,
    status: 'success' | 'error'
  ): void {
    if (!this.initialized) return;

    this.colorAnalysisRequestsTotal
      .labels(provider, tenantId, status)
      .inc();
  }

  /**
   * Record subtitle generation metrics
   */
  recordSubtitleGeneration(
    format: string,
    language: string,
    tenantId: string,
    status: 'success' | 'error'
  ): void {
    if (!this.initialized) return;

    this.subtitleGenerationTotal
      .labels(format, language, tenantId, status)
      .inc();
  }

  /**
   * Record queue job metrics
   */
  recordQueueJob(
    queueName: string,
    duration: number,
    status: 'completed' | 'failed',
    errorType?: string
  ): void {
    if (!this.initialized) return;

    this.queueJobsTotal
      .labels(queueName, status)
      .inc();

    this.queueJobDuration
      .labels(queueName)
      .observe(duration);

    if (status === 'failed' && errorType) {
      this.queueJobsFailed
        .labels(queueName, errorType)
        .inc();
    }
  }

  /**
   * Update active queue jobs
   */
  updateActiveQueueJobs(queueName: string, count: number): void {
    if (!this.initialized) return;

    this.queueJobsActive
      .labels(queueName)
      .set(count);
  }

  /**
   * Record API usage by tenant
   */
  recordApiUsage(tenantId: string, plan: string, feature: string): void {
    if (!this.initialized) return;

    this.apiUsageByTenant
      .labels(tenantId, plan, feature)
      .inc();
  }

  /**
   * Update subscription status
   */
  updateSubscriptionStatus(tenantId: string, plan: string, isActive: boolean): void {
    if (!this.initialized) return;

    this.subscriptionStatus
      .labels(tenantId, plan)
      .set(isActive ? 1 : 0);
  }

  /**
   * Record usage limit exceeded
   */
  recordUsageLimitExceeded(tenantId: string, plan: string, limitType: string): void {
    if (!this.initialized) return;

    this.usageLimitsExceeded
      .labels(tenantId, plan, limitType)
      .inc();
  }

  /**
   * Record storage operation
   */
  recordStorageOperation(
    operation: string,
    provider: string,
    duration: number,
    status: 'success' | 'error'
  ): void {
    if (!this.initialized) return;

    this.storageOperationsTotal
      .labels(operation, provider, status)
      .inc();

    if (status === 'success') {
      this.storageOperationDuration
        .labels(operation, provider)
        .observe(duration);
    }
  }

  /**
   * Update storage usage
   */
  updateStorageUsage(tenantId: string, provider: string, contentType: string, bytes: number): void {
    if (!this.initialized) return;

    this.storageUsageBytes
      .labels(tenantId, provider, contentType)
      .set(bytes);
  }

  /**
   * Get all metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    if (!this.initialized) {
      return '# Metrics service not initialized\n';
    }

    try {
      return await register.metrics();
    } catch (error) {
      logger.error('Failed to get metrics', { error });
      return '# Error retrieving metrics\n';
    }
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    if (!this.initialized) return;
    register.clear();
  }

  /**
   * Health check
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let metricsService: MetricsService | null = null;

export const getMetricsService = (): MetricsService => {
  if (!metricsService) {
    metricsService = new MetricsService();
  }
  return metricsService;
};
