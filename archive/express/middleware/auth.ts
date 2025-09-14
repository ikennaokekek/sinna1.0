import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        tenantId: string;
        apiKey: string;
        isActive: boolean;
        subscription?: {
          status: 'active' | 'inactive' | 'cancelled';
          plan: string;
          usage: {
            requests: number;
            limit: number;
          };
        };
      };
    }
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key is required',
        code: 'MISSING_API_KEY'
      });
      return;
    }

    // TODO: Implement actual API key validation with database lookup
    // For now, we'll use a placeholder implementation
    const mockUser = {
      id: 'user_123',
      tenantId: 'tenant_123',
      apiKey,
      isActive: true,
      subscription: {
        status: 'active' as const,
        plan: 'pro',
        usage: {
          requests: 0,
          limit: 10000
        }
      }
    };

    // Validate API key format (should start with 'sk_')
    if (!apiKey.startsWith('sk_')) {
      res.status(401).json({
        success: false,
        error: 'Invalid API key format',
        code: 'INVALID_API_KEY'
      });
      return;
    }

    // Check if user is active
    if (!mockUser.isActive) {
      res.status(401).json({
        success: false,
        error: 'Account is inactive',
        code: 'INACTIVE_ACCOUNT'
      });
      return;
    }

    // Check subscription status
    if (mockUser.subscription?.status !== 'active') {
      res.status(402).json({
        success: false,
        error: 'Subscription required',
        code: 'SUBSCRIPTION_REQUIRED'
      });
      return;
    }

    // Check usage limits
    if (mockUser.subscription && 
        mockUser.subscription.usage.requests >= mockUser.subscription.usage.limit) {
      res.status(429).json({
        success: false,
        error: 'Usage limit exceeded',
        code: 'USAGE_LIMIT_EXCEEDED',
        details: {
          current: mockUser.subscription.usage.requests,
          limit: mockUser.subscription.usage.limit
        }
      });
      return;
    }

    req.user = mockUser;
    next();

  } catch (error) {
    logger.error('Authentication error', { error, apiKey: req.headers['x-api-key'] });
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};
