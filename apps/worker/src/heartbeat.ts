export const HEARTBEAT_SUFFIX = 'worker:heartbeat';

export interface HeartbeatClient {
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  scan(cursor: string, mode: 'MATCH', pattern: string, count: 'COUNT', size: number): Promise<[string, string[]]>;
}

export interface WorkerHeartbeat {
  instanceId: string;
  state: 'starting' | 'ready' | 'draining';
  version: string;
  queues: string[];
  updatedAt: number;
}

export function heartbeatPrefix(queuePrefix: string): string {
  return `${queuePrefix}:${HEARTBEAT_SUFFIX}`;
}

export function heartbeatKey(queuePrefix: string, instanceId: string): string {
  return `${heartbeatPrefix(queuePrefix)}:${instanceId}`;
}

export async function writeHeartbeat(client: HeartbeatClient, queuePrefix: string, heartbeat: WorkerHeartbeat, ttlSeconds = 45): Promise<void> {
  await client.set(heartbeatKey(queuePrefix, heartbeat.instanceId), JSON.stringify({ ...heartbeat, updatedAt: Date.now() }), 'EX', ttlSeconds);
}

export function isFreshReadyHeartbeat(raw: string | null, now = Date.now(), maxAgeMs = 60_000): boolean {
  try {
    const value = JSON.parse(raw || '') as WorkerHeartbeat;
    return value.state === 'ready' && Array.isArray(value.queues) && now - value.updatedAt >= 0 && now - value.updatedAt <= maxAgeMs;
  } catch {
    return false;
  }
}