import { Request, Response, NextFunction } from 'express';
import { getStripeService } from '../services/stripe';
import { logger } from '../utils/logger';

export interface UsageTracker {
  requests: number;
  transcriptionMinutes: number;
  audioDescriptionMinutes: number;
  colorAnalysisRequests: number;
  resetDate: Date;
}

// In-memory usage tracking (in production, use Redis or database)
const usageTracking = new Map<string, UsageTracker>();

export const paywallMiddleware = (options: {
  feature: 'transcription' | 'audio-description' | 'color-analysis' | 'general';
  cost?: {
    requests?: number;
    transcriptionMinutes?: number;
    audioDescriptionMinutes?: number;
    colorAnalysisRequests?: number;
  };
} = { feature: 'general' }) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
        return;
      }

      // Skip paywall for gold plans or if subscription is inactive (grace period)
      if (user.subscription?.plan === 'gold') {
        next();
        return;
      }

      const stripeService = getStripeService();
      
      // Check if user has active subscription
      const hasActiveSubscription = await stripeService.hasActiveSubscription(user.id);
      
      if (!hasActiveSubscription) {
        res.status(402).json({
          success: false,
          error: 'Active subscription required',
          code: 'SUBSCRIPTION_REQUIRED',
          details: {
            message: 'This feature requires an active subscription',
            upgradeUrl: `${process.env.BASE_URL}/api/v1/billing/upgrade`,
            availablePlans: stripeService.getPlans().map(plan => ({
              id: plan.id,
              name: plan.name,
              price: plan.price,
              currency: plan.currency,
              interval: plan.interval
            }))
          }
        });
        return;
      }

      // Get customer subscription details
      const customerData = await stripeService.getCustomerSubscription(user.id);
      if (!customerData || !customerData.planId) {
        res.status(402).json({
          success: false,
          error: 'Invalid subscription',
          code: 'INVALID_SUBSCRIPTION'
        });
        return;
      }

      // Get plan limits
      const plan = stripeService.getPlan(customerData.planId);
      if (!plan) {
        res.status(500).json({
          success: false,
          error: 'Plan configuration error',
          code: 'PLAN_NOT_FOUND'
        });
        return;
      }

      // Get or initialize usage tracking
      let usage = usageTracking.get(user.tenantId);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      if (!usage || usage.resetDate < startOfMonth) {
        usage = {
          requests: 0,
          transcriptionMinutes: 0,
          audioDescriptionMinutes: 0,
          colorAnalysisRequests: 0,
          resetDate: startOfMonth
        };
        usageTracking.set(user.tenantId, usage);
      }

      // Check feature-specific limits
      const cost = options.cost || { requests: 1 };
      const wouldExceedLimits = checkUsageLimits(usage, plan.features, cost);

      if (wouldExceedLimits.exceeded) {
        res.status(429).json({
          success: false,
          error: 'Usage limit exceeded',
          code: 'USAGE_LIMIT_EXCEEDED',
          details: {
            feature: options.feature,
            limitType: wouldExceedLimits.limitType,
            current: wouldExceedLimits.current,
            limit: wouldExceedLimits.limit,
            resetDate: usage.resetDate,
            upgradeUrl: `${process.env.BASE_URL}/api/v1/billing/upgrade`,
            suggestedPlan: getSuggestedUpgrade(customerData.planId, stripeService.getPlans())
          }
        });
        return;
      }

      // Update usage tracking
      updateUsage(usage, cost);
      usageTracking.set(user.tenantId, usage);

      // Add usage info to request for monitoring
      req.usage = {
        current: usage,
        limits: plan.features,
        plan: plan
      };

      next();

    } catch (error) {
      logger.error('Paywall middleware error', { error, feature: options.feature });
      res.status(500).json({
        success: false,
        error: 'Billing system error',
        code: 'BILLING_ERROR'
      });
    }
  };
};

/**
 * Check if usage would exceed limits
 */
function checkUsageLimits(
  usage: UsageTracker,
  limits: any,
  cost: any
): { exceeded: boolean; limitType?: string; current?: number; limit?: number } {
  
  // Check general requests
  if (cost.requests && usage.requests + cost.requests > limits.requestsPerMonth) {
    return {
      exceeded: true,
      limitType: 'requests',
      current: usage.requests,
      limit: limits.requestsPerMonth
    };
  }

  // Check transcription minutes
  if (cost.transcriptionMinutes && 
      usage.transcriptionMinutes + cost.transcriptionMinutes > limits.transcriptionMinutes) {
    return {
      exceeded: true,
      limitType: 'transcriptionMinutes',
      current: usage.transcriptionMinutes,
      limit: limits.transcriptionMinutes
    };
  }

  // Check audio description minutes
  if (cost.audioDescriptionMinutes && 
      usage.audioDescriptionMinutes + cost.audioDescriptionMinutes > limits.audioDescriptionMinutes) {
    return {
      exceeded: true,
      limitType: 'audioDescriptionMinutes',
      current: usage.audioDescriptionMinutes,
      limit: limits.audioDescriptionMinutes
    };
  }

  // Check color analysis requests
  if (cost.colorAnalysisRequests && 
      usage.colorAnalysisRequests + cost.colorAnalysisRequests > limits.colorAnalysisRequests) {
    return {
      exceeded: true,
      limitType: 'colorAnalysisRequests',
      current: usage.colorAnalysisRequests,
      limit: limits.colorAnalysisRequests
    };
  }

  return { exceeded: false };
}

/**
 * Update usage counters
 */
function updateUsage(usage: UsageTracker, cost: any): void {
  if (cost.requests) usage.requests += cost.requests;
  if (cost.transcriptionMinutes) usage.transcriptionMinutes += cost.transcriptionMinutes;
  if (cost.audioDescriptionMinutes) usage.audioDescriptionMinutes += cost.audioDescriptionMinutes;
  if (cost.colorAnalysisRequests) usage.colorAnalysisRequests += cost.colorAnalysisRequests;
}

/**
 * Get suggested upgrade plan
 */
function getSuggestedUpgrade(currentPlanId: string, plans: any[]): any {
  const planOrder = ['standard', 'gold'];
  const currentIndex = planOrder.indexOf(currentPlanId);
  
  if (currentIndex === -1 || currentIndex === planOrder.length - 1) {
    return null;
  }

  const nextPlanId = planOrder[currentIndex + 1];
  return plans.find(p => p.id === nextPlanId);
}

/**
 * Usage reporting middleware
 */
export const usageReportingMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Override res.json to capture response and log usage
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // Log successful API usage
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        logger.info('API usage recorded', {
          tenantId: req.user.tenantId,
          userId: req.user.id,
          endpoint: req.path,
          method: req.method,
          statusCode: res.statusCode,
          timestamp: new Date().toISOString()
        });
      }
      
      return originalJson.call(this, body);
    };

    next();
  };
};

/**
 * Get current usage for a tenant
 */
export const getCurrentUsage = (tenantId: string): UsageTracker | null => {
  return usageTracking.get(tenantId) || null;
};

/**
 * Reset usage for a tenant (useful for testing)
 */
export const resetUsage = (tenantId: string): void => {
  usageTracking.delete(tenantId);
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      usage?: {
        current: UsageTracker;
        limits: any;
        plan: any;
      };
    }
  }
}
