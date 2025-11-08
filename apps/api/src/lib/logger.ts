// Simple request ID generator (using crypto.randomUUID if available, fallback to timestamp)
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older Node versions
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// Enhanced logger with request ID tracking
export interface Logger {
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
  debug: (msg: string, data?: Record<string, unknown>) => void;
}

export function createLogger(requestId?: string): Logger {
  const reqId = requestId || generateRequestId();
  const prefix = `[${reqId}]`;

  return {
    info: (msg: string, data?: Record<string, unknown>) => {
      console.log(`${prefix} [INFO] ${msg}`, data || '');
    },
    warn: (msg: string, data?: Record<string, unknown>) => {
      console.warn(`${prefix} [WARN] ${msg}`, data || '');
    },
    error: (msg: string, data?: Record<string, unknown>) => {
      console.error(`${prefix} [ERROR] ${msg}`, data || '');
    },
    debug: (msg: string, data?: Record<string, unknown>) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`${prefix} [DEBUG] ${msg}`, data || '');
      }
    },
  };
}

// Performance monitoring
export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  operation: string;
  requestId?: string;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();

  start(operation: string, requestId?: string): string {
    const id = `${operation}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.metrics.set(id, {
      startTime: Date.now(),
      operation,
      requestId,
    });
    return id;
  }

  end(id: string): number | null {
    const metric = this.metrics.get(id);
    if (!metric) return null;

    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    
    // Log slow operations (>1 second)
    if (metric.duration > 1000) {
      console.warn(`[PERF] Slow operation detected: ${metric.operation} took ${metric.duration}ms`, {
        requestId: metric.requestId,
        duration: metric.duration,
      });
    }

    this.metrics.delete(id);
    return metric.duration;
  }

  getMetrics(): PerformanceMetrics[] {
    return Array.from(this.metrics.values());
  }
}

export const performanceMonitor = new PerformanceMonitor();

