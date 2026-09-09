export type DependencyCheck = () => Promise<boolean>;

export interface ReadinessStatus {
  ok: boolean;
  checks: { postgres: 'up' | 'down'; redis: 'up' | 'down' };
}

/** Bounded, detail-free dependency status for the public readiness endpoint. */
export async function checkReadiness(
  postgres: DependencyCheck,
  redis: DependencyCheck,
  timeoutMs = 1_000,
): Promise<ReadinessStatus> {
  const bounded = async (check: DependencyCheck) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        check(),
        new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const [postgresOk, redisOk] = await Promise.all([bounded(postgres), bounded(redis)]);
  return {
    ok: postgresOk && redisOk,
    checks: { postgres: postgresOk ? 'up' : 'down', redis: redisOk ? 'up' : 'down' },
  };
}