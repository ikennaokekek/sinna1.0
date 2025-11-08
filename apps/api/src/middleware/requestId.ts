import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest } from '../types';

// Generate request ID
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// Request ID middleware - adds request ID to all requests
export async function requestIdHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const requestId = generateRequestId();
  (req as AuthenticatedRequest).requestId = requestId;
  reply.header('X-Request-ID', requestId);
}

