import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { logger } from '../utils/logger';

// Create rate limiter instance
const rateLimiter = new RateLimiterMemory({
  points: parseInt(process.env.API_RATE_LIMIT || '100', 10), // Number of requests
  duration: 60, // Per 60 seconds
  blockDuration: 60, // Block for 60 seconds if limit exceeded
});

export const rateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const key = req.user?.apiKey || req.ip;
    
    await rateLimiter.consume(key);
    next();
    
  } catch (rateLimiterRes) {
    const remainingPoints = rateLimiterRes?.remainingPoints || 0;
    const msBeforeNext = rateLimiterRes?.msBeforeNext || 60000;
    
    logger.warn('Rate limit exceeded', {
      key: req.user?.apiKey || req.ip,
      remainingPoints,
      msBeforeNext
    });
    
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      details: {
        remainingPoints,
        retryAfter: Math.round(msBeforeNext / 1000),
        limit: parseInt(process.env.API_RATE_LIMIT || '100', 10)
      }
    });
  }
};
