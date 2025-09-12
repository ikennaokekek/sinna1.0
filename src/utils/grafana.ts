import fetch from 'node-fetch';
import { logger } from './logger';

export interface GrafanaMetric {
  name: string;
  value: number;
  timestamp?: number;
  labels?: Record<string, string>;
}

export class GrafanaService {
  private pushUrl: string;
  private enabled: boolean;

  constructor() {
    this.pushUrl = process.env.GRAFANA_PROM_PUSH_URL || '';
    this.enabled = !!this.pushUrl;
    
    if (this.enabled) {
      logger.info('Grafana push service initialized', { pushUrl: this.pushUrl });
    } else {
      logger.debug('Grafana push service disabled - no GRAFANA_PROM_PUSH_URL provided');
    }
  }

  /**
   * Push metrics to Grafana (Prometheus Push Gateway)
   */
  async pushMetrics(
    job: string,
    metrics: GrafanaMetric[],
    instance?: string
  ): Promise<boolean> {
    if (!this.enabled) {
      logger.debug('Grafana push disabled, skipping metrics push');
      return false;
    }

    try {
      // Build Prometheus format
      let prometheusData = '';
      
      for (const metric of metrics) {
        const labels = metric.labels || {};
        const labelString = Object.entries(labels)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',');
        
        const metricLine = labelString ? 
          `${metric.name}{${labelString}} ${metric.value}` :
          `${metric.name} ${metric.value}`;
        
        if (metric.timestamp) {
          prometheusData += `${metricLine} ${metric.timestamp}\n`;
        } else {
          prometheusData += `${metricLine}\n`;
        }
      }

      // Build push URL
      let pushUrl = `${this.pushUrl}/metrics/job/${encodeURIComponent(job)}`;
      if (instance) {
        pushUrl += `/instance/${encodeURIComponent(instance)}`;
      }

      // Push to Prometheus Push Gateway
      const response = await fetch(pushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        },
        body: prometheusData,
      });

      if (!response.ok) {
        throw new Error(`Push failed with status ${response.status}: ${response.statusText}`);
      }

      logger.debug('Metrics pushed to Grafana successfully', {
        job,
        instance,
        metricsCount: metrics.length
      });

      return true;

    } catch (error) {
      logger.error('Failed to push metrics to Grafana', {
        error: error instanceof Error ? error.message : 'Unknown error',
        job,
        instance,
        metricsCount: metrics.length
      });
      return false;
    }
  }

  /**
   * Push business metrics
   */
  async pushBusinessMetrics(tenantId: string, metrics: {
    transcriptionRequests?: number;
    audioDescriptionRequests?: number;
    colorAnalysisRequests?: number;
    apiRequests?: number;
    errors?: number;
  }): Promise<boolean> {
    const grafanaMetrics: GrafanaMetric[] = [];
    const timestamp = Date.now();

    if (metrics.transcriptionRequests !== undefined) {
      grafanaMetrics.push({
        name: 'sinna_transcription_requests_total',
        value: metrics.transcriptionRequests,
        timestamp,
        labels: { tenant_id: tenantId }
      });
    }

    if (metrics.audioDescriptionRequests !== undefined) {
      grafanaMetrics.push({
        name: 'sinna_audio_description_requests_total',
        value: metrics.audioDescriptionRequests,
        timestamp,
        labels: { tenant_id: tenantId }
      });
    }

    if (metrics.colorAnalysisRequests !== undefined) {
      grafanaMetrics.push({
        name: 'sinna_color_analysis_requests_total',
        value: metrics.colorAnalysisRequests,
        timestamp,
        labels: { tenant_id: tenantId }
      });
    }

    if (metrics.apiRequests !== undefined) {
      grafanaMetrics.push({
        name: 'sinna_api_requests_total',
        value: metrics.apiRequests,
        timestamp,
        labels: { tenant_id: tenantId }
      });
    }

    if (metrics.errors !== undefined) {
      grafanaMetrics.push({
        name: 'sinna_errors_total',
        value: metrics.errors,
        timestamp,
        labels: { tenant_id: tenantId }
      });
    }

    if (grafanaMetrics.length === 0) {
      return true; // Nothing to push
    }

    return this.pushMetrics('sinna-api-business', grafanaMetrics, tenantId);
  }

  /**
   * Push system metrics
   */
  async pushSystemMetrics(metrics: {
    memoryUsage?: number;
    cpuUsage?: number;
    uptime?: number;
    activeConnections?: number;
    queueDepth?: number;
  }): Promise<boolean> {
    const grafanaMetrics: GrafanaMetric[] = [];
    const timestamp = Date.now();
    const instance = process.env.HOSTNAME || `pid-${process.pid}`;

    if (metrics.memoryUsage !== undefined) {
      grafanaMetrics.push({
        name: 'sinna_memory_usage_bytes',
        value: metrics.memoryUsage,
        timestamp
      });
    }

    if (metrics.cpuUsage !== undefined) {
      grafanaMetrics.push({
        name: 'sinna_cpu_usage_percent',
        value: metrics.cpuUsage,
        timestamp
      });
    }

    if (metrics.uptime !== undefined) {
      grafanaMetrics.push({
        name: 'sinna_uptime_seconds',
        value: metrics.uptime,
        timestamp
      });
    }

    if (metrics.activeConnections !== undefined) {
      grafanaMetrics.push({
        name: 'sinna_active_connections',
        value: metrics.activeConnections,
        timestamp
      });
    }

    if (metrics.queueDepth !== undefined) {
      grafanaMetrics.push({
        name: 'sinna_queue_depth',
        value: metrics.queueDepth,
        timestamp
      });
    }

    if (grafanaMetrics.length === 0) {
      return true; // Nothing to push
    }

    return this.pushMetrics('sinna-api-system', grafanaMetrics, instance);
  }

  /**
   * Push custom metrics
   */
  async pushCustomMetrics(
    job: string,
    metrics: Record<string, number>,
    labels?: Record<string, string>,
    instance?: string
  ): Promise<boolean> {
    const grafanaMetrics: GrafanaMetric[] = Object.entries(metrics).map(([name, value]) => ({
      name,
      value,
      timestamp: Date.now(),
      labels
    }));

    return this.pushMetrics(job, grafanaMetrics, instance);
  }

  /**
   * Test connection to Grafana Push Gateway
   */
  async testConnection(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const testMetric: GrafanaMetric = {
        name: 'sinna_test_metric',
        value: 1,
        timestamp: Date.now(),
        labels: { test: 'true' }
      };

      const success = await this.pushMetrics('sinna-api-test', [testMetric], 'test-instance');
      
      if (success) {
        logger.info('Grafana connection test successful');
      }
      
      return success;

    } catch (error) {
      logger.error('Grafana connection test failed', { error });
      return false;
    }
  }

  /**
   * Check if Grafana push is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get push URL (for debugging)
   */
  getPushUrl(): string {
    return this.pushUrl;
  }
}

// Singleton instance
let grafanaService: GrafanaService | null = null;

export const getGrafanaService = (): GrafanaService => {
  if (!grafanaService) {
    grafanaService = new GrafanaService();
  }
  return grafanaService;
};
