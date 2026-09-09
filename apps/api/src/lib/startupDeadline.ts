import { withDeadline } from '@sinna/types';

export const API_STARTUP_DEADLINE_MS = 4_500;

export function runWithinApiStartupDeadline<T>(
  start: () => Promise<T>,
  timeoutMs = API_STARTUP_DEADLINE_MS,
): Promise<T> {
  return withDeadline(start(), timeoutMs, 'Core API startup deadline exceeded');
}