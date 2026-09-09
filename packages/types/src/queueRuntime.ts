export const CORE_QUEUE_NAMES = ['captions', 'ad', 'color', 'video-transform'] as const;

export function coreQueuePrefix(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.QUEUE_PREFIX || (env.NODE_ENV === 'production' ? '' : 'sinna:development');
  if (!/^[a-z0-9][a-z0-9:_-]{2,63}$/.test(value)) {
    throw new Error('QUEUE_PREFIX must be 3-64 lowercase letters, numbers, colons, underscores, or hyphens');
  }
  return value;
}

export const coreQueueRetryOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800, count: 5_000 },
};