import { describe, expect, it } from 'vitest';
import { CORE_QUEUE_NAMES, coreQueuePrefix, coreQueueRetryOptions } from '../packages/types/src/queueRuntime';

describe('Core queue runtime contract', () => {
  it('uses the four isolated Core queues and bounded retry defaults', () => {
    expect(CORE_QUEUE_NAMES).toEqual(['captions', 'ad', 'color', 'video-transform']);
    expect(coreQueueRetryOptions).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
    });
  });

  it('requires an explicit valid production namespace', () => {
    expect(coreQueuePrefix({ NODE_ENV: 'production', QUEUE_PREFIX: 'sinna:production' } as NodeJS.ProcessEnv))
      .toBe('sinna:production');
    expect(() => coreQueuePrefix({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow();
    expect(() => coreQueuePrefix({ QUEUE_PREFIX: 'INVALID PREFIX' } as NodeJS.ProcessEnv)).toThrow();
  });
});