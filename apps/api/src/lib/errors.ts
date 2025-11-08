import { FastifyReply } from 'fastify';
import { ErrorResponse } from '../types';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function sendErrorResponse(reply: FastifyReply, error: ApiError | Error, statusCode = 500): void {
  if (error instanceof ApiError) {
    const response: ErrorResponse = {
      success: false,
      error: error.code,
      message: error.message,
      details: error.details,
    };
    reply.code(error.statusCode).send(response);
  } else {
    const response: ErrorResponse = {
      success: false,
      error: 'internal_error',
      message: error.message || 'An internal error occurred',
    };
    reply.code(statusCode).send(response);
  }
}

export function createError(code: string, message: string, statusCode = 500, details?: unknown): ApiError {
  return new ApiError(statusCode, code, message, details);
}

// Common error codes
export const ErrorCodes = {
  UNAUTHORIZED: 'unauthorized',
  PAYMENT_REQUIRED: 'payment_required',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  RATE_LIMITED: 'rate_limited',
  VALIDATION_ERROR: 'validation_error',
  STRIPE_UNCONFIGURED: 'stripe_unconfigured',
  MISSING_PRICE: 'missing_price',
  STRIPE_ERROR: 'stripe_error',
  INTERNAL_ERROR: 'internal_error',
  TENANT_NOT_FOUND: 'tenant_not_found',
} as const;

