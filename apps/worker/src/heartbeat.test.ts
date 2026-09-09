import { describe, expect, it } from 'vitest';
import { heartbeatKey, heartbeatPrefix, isFreshReadyHeartbeat } from './heartbeat';

describe('worker heartbeat', () => {
  it('uses a namespaced key and recognizes fresh ready records', () => {
    expect(heartbeatPrefix('sinna:test')).toBe('sinna:test:worker:heartbeat');
    expect(heartbeatKey('sinna:test', 'unit-1')).toBe('sinna:test:worker:heartbeat:unit-1');
    expect(isFreshReadyHeartbeat(JSON.stringify({ state: 'ready', queues: ['captions'], updatedAt: 100 }), 200)).toBe(true);
  });
  it('rejects stale, malformed, and non-ready records', () => {
    expect(isFreshReadyHeartbeat(null)).toBe(false);
    expect(isFreshReadyHeartbeat(JSON.stringify({ state: 'draining', queues: [], updatedAt: Date.now() }))).toBe(false);
    expect(isFreshReadyHeartbeat(JSON.stringify({ state: 'ready', queues: [], updatedAt: 0 }), 100_000)).toBe(false);
  });
});