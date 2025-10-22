import { getDb } from './db';

export type UsageDeltas = {
  minutes?: number;
  jobs?: number;
  egressBytes?: number;
};

export type PlanCaps = {
  minutesCap: number; // per month
  jobsCap: number; // per month
  egressCapBytes: number; // per month
};

const GIB = 1024 * 1024 * 1024;

const DEFAULT_PLAN_CAPS: Record<string, PlanCaps> = {
  standard: { minutesCap: 1000, jobsCap: 1000, egressCapBytes: 50 * GIB },
  pro: { minutesCap: 10000, jobsCap: 10000, egressCapBytes: 500 * GIB },
  enterprise: { minutesCap: Number.POSITIVE_INFINITY, jobsCap: Number.POSITIVE_INFINITY, egressCapBytes: Number.POSITIVE_INFINITY },
};

function getPlanCaps(planRaw: unknown): PlanCaps {
  const plan = (typeof planRaw === 'string' ? planRaw : 'standard').toLowerCase();
  return DEFAULT_PLAN_CAPS[plan] || DEFAULT_PLAN_CAPS.standard;
}

export async function incrementAndGateUsage(
  tenantId: string,
  deltas: UsageDeltas
): Promise<{
  blocked: boolean;
  reason?: 'minutes' | 'jobs' | 'egress';
  usageAfter?: { minutes: number; jobs: number; egressBytes: number };
  caps?: PlanCaps;
}> {
  const { pool } = getDb();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `insert into usage_counters(tenant_id, period_start, minutes_used, jobs, egress_bytes)
       values ($1, date_trunc('month', now())::date, 0, 0, 0)
       on conflict (tenant_id) do nothing`,
      [tenantId]
    );

    const { rows } = await client.query(
      `select u.minutes_used, u.jobs, u.egress_bytes, u.period_start, t.plan
       from usage_counters u join tenants t on t.id = u.tenant_id
       where u.tenant_id = $1
       for update`,
      [tenantId]
    );
    if (rows.length === 0) {
      // If tenant row missing, create baseline and re-read
      await client.query(
        `insert into usage_counters(tenant_id, period_start, minutes_used, jobs, egress_bytes)
         values ($1, date_trunc('month', now())::date, 0, 0, 0)
         on conflict (tenant_id) do nothing`,
        [tenantId]
      );
      const reread = await client.query(
        `select u.minutes_used, u.jobs, u.egress_bytes, u.period_start, t.plan
         from usage_counters u join tenants t on t.id = u.tenant_id
         where u.tenant_id = $1
         for update`,
        [tenantId]
      );
      rows.push(...reread.rows);
    }

    const row = rows[0];
    const caps = getPlanCaps(row?.plan);

    const periodStart: Date | null = row?.period_start ? new Date(row.period_start) : null;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    let minutes = Number(row?.minutes_used || 0);
    let jobs = Number(row?.jobs || 0);
    let egressBytes = Number(row?.egress_bytes || 0);

    // Reset counters if period changed
    if (!periodStart || periodStart < monthStart) {
      minutes = 0;
      jobs = 0;
      egressBytes = 0;
      await client.query(
        `update usage_counters
         set period_start = date_trunc('month', now())::date, minutes_used = 0, jobs = 0, egress_bytes = 0
         where tenant_id = $1`,
        [tenantId]
      );
    }

    const minutesDelta = Number(deltas.minutes || 0);
    const jobsDelta = Number(deltas.jobs || 0);
    const egressDelta = Number(deltas.egressBytes || 0);

    const newMinutes = minutes + minutesDelta;
    const newJobs = jobs + jobsDelta;
    const newEgress = egressBytes + egressDelta;

    if (newMinutes > caps.minutesCap) {
      await client.query('ROLLBACK');
      return { blocked: true, reason: 'minutes', caps };
    }
    if (newJobs > caps.jobsCap) {
      await client.query('ROLLBACK');
      return { blocked: true, reason: 'jobs', caps };
    }
    if (newEgress > caps.egressCapBytes) {
      await client.query('ROLLBACK');
      return { blocked: true, reason: 'egress', caps };
    }

    await client.query(
      `update usage_counters
       set minutes_used = $2, jobs = $3, egress_bytes = $4
       where tenant_id = $1`,
      [tenantId, newMinutes, newJobs, newEgress]
    );

    await client.query('COMMIT');
    return { blocked: false, usageAfter: { minutes: newMinutes, jobs: newJobs, egressBytes: newEgress }, caps };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function addUsage(
  tenantId: string,
  deltas: UsageDeltas
): Promise<void> {
  const { pool } = getDb();
  await pool.query(
    `insert into usage_counters(tenant_id, period_start, minutes_used, jobs, egress_bytes)
     values ($1, date_trunc('month', now())::date, 0, 0, 0)
     on conflict (tenant_id) do nothing`,
    [tenantId]
  );
  const minutesDelta = Number(deltas.minutes || 0);
  const jobsDelta = Number(deltas.jobs || 0);
  const egressDelta = Number(deltas.egressBytes || 0);
  await pool.query(
    `update usage_counters
     set minutes_used = minutes_used + $2,
         jobs = jobs + $3,
         egress_bytes = egress_bytes + $4
     where tenant_id = $1`,
    [tenantId, minutesDelta, jobsDelta, egressDelta]
  );
}


