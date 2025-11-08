import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest } from '../types';
import { performanceMonitor } from '../lib/logger';
import { checkSlowRequests, sendAlert } from '../lib/alerts';

// Performance monitoring middleware - tracks request duration
const activeRequests = new Map<string, { perfId: string; startTime: number }>();

export async function performanceMonitoringHook(req: FastifyRequest): Promise<void> {
  const requestId = (req as AuthenticatedRequest).requestId;
  if (requestId) {
    const perfId = performanceMonitor.start(`${req.method} ${req.url}`, requestId);
    activeRequests.set(requestId, { perfId, startTime: Date.now() });
  }
}

export async function performanceMonitoringOnSendHook(
  req: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): Promise<unknown> {
  const requestId = (req as AuthenticatedRequest).requestId;
  if (requestId) {
    const requestData = activeRequests.get(requestId);
    if (requestData) {
      const duration = performanceMonitor.end(requestData.perfId);
      activeRequests.delete(requestId);
      
      if (duration !== null) {
        // Check for slow requests and alert
        if (checkSlowRequests(duration)) {
          sendAlert('warning', 'Slow request detected', {
            method: req.method,
            url: req.url,
            duration,
            requestId,
            statusCode: reply.statusCode,
          });
        }
      }
    }
  }
  return payload;
}

// Alert helper for monitoring
export function checkAndAlert(
  condition: boolean,
  message: string,
  severity: 'error' | 'warn' | 'info' = 'warn'
): void {
  if (condition) {
    const logFn = severity === 'error' ? console.error : severity === 'warn' ? console.warn : console.log;
    logFn(`[ALERT] ${message}`);
    
    // In production, you would send to monitoring service (e.g., Sentry, Datadog)
    if (process.env.SENTRY_DSN && severity === 'error') {
      // Sentry integration would go here
    }
  }
}

