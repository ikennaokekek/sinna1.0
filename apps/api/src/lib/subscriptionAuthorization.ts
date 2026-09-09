import type { Pool } from 'pg';
import { withDeadline } from '@sinna/types';

export async function lookupTenantAuthorization(
  pool: Pick<Pool, 'query'>,
  keyHash: string,
  timeoutMs = 1_800,
) {
  const serverTimeoutMs = Math.max(1, timeoutMs - 200);
  const operation = pool.query({
    text: `WITH timeout_config AS MATERIALIZED (
             SELECT set_config('statement_timeout', $2, true)
           )
           SELECT t.id AS tenant_id, t.active, t.status, t.grace_until, t.expires_at
             FROM timeout_config, api_keys k
             JOIN tenants t ON t.id = k.tenant_id
            WHERE k.key_hash = $1`,
    values: [keyHash, `${serverTimeoutMs}ms`],
    query_timeout: timeoutMs,
  } as any) as Promise<{ rows: any[]; rowCount?: number | null }>;
  return withDeadline(operation, timeoutMs + 200, 'Tenant authorization lookup deadline exceeded');
}