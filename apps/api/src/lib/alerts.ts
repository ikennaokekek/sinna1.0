// Alert system for monitoring
export interface AlertConfig {
  errorRateThreshold?: number; // Percentage (0-100)
  slowRequestThreshold?: number; // Milliseconds
  queueDepthThreshold?: number;
  databaseConnectionThreshold?: number; // Max connection pool usage percentage
}

const defaultConfig: AlertConfig = {
  errorRateThreshold: 5, // 5% error rate
  slowRequestThreshold: 2000, // 2 seconds
  queueDepthThreshold: 1000,
  databaseConnectionThreshold: 80, // 80% pool usage
};

export function checkErrorRate(
  totalRequests: number,
  errorCount: number,
  config: AlertConfig = defaultConfig
): boolean {
  if (totalRequests === 0) return false;
  const errorRate = (errorCount / totalRequests) * 100;
  const threshold = config.errorRateThreshold || defaultConfig.errorRateThreshold || 5;
  return errorRate > threshold;
}

export function checkSlowRequests(
  duration: number,
  config: AlertConfig = defaultConfig
): boolean {
  const threshold = config.slowRequestThreshold || defaultConfig.slowRequestThreshold || 2000;
  return duration > threshold;
}

export function checkQueueDepth(
  depth: number,
  config: AlertConfig = defaultConfig
): boolean {
  const threshold = config.queueDepthThreshold || defaultConfig.queueDepthThreshold || 1000;
  return depth > threshold;
}

export function checkDatabaseConnections(
  used: number,
  max: number,
  config: AlertConfig = defaultConfig
): boolean {
  if (max === 0) return false;
  const usagePercent = (used / max) * 100;
  const threshold = config.databaseConnectionThreshold || defaultConfig.databaseConnectionThreshold || 80;
  return usagePercent > threshold;
}

export function sendAlert(
  severity: 'critical' | 'warning' | 'info',
  message: string,
  details?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[ALERT:${severity.toUpperCase()}] ${message}`;
  
  if (severity === 'critical') {
    console.error(logMessage, { timestamp, ...details });
    // In production, send to monitoring service (Sentry, PagerDuty, etc.)
  } else if (severity === 'warning') {
    console.warn(logMessage, { timestamp, ...details });
  } else {
    console.log(logMessage, { timestamp, ...details });
  }
}

