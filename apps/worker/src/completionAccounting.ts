interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rowCount?: number | null }>;
}

interface TransactionClient extends Queryable {
  release(): void;
}

interface Connectable {
  connect(): Promise<TransactionClient>;
}

export interface WorkerCompletion {
  queueName: string;
  jobId: string;
  tenantId: string;
  minutesUsed?: number;
  egressBytes?: number;
}

export async function recordWorkerCompletion(db: Connectable, completion: WorkerCompletion): Promise<void> {
  const minutesUsed = Math.max(0, Math.floor(completion.minutesUsed || 0));
  const egressBytes = Math.max(0, Math.floor(completion.egressBytes || 0));
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO public.worker_job_completions
         (queue_name, job_id, tenant_id, minutes_used, egress_bytes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (queue_name, job_id) DO NOTHING`,
      [completion.queueName, completion.jobId, completion.tenantId, minutesUsed, egressBytes],
    );
    if (inserted.rowCount === 1) {
      await client.query(
        `INSERT INTO public.usage_counters
           (tenant_id, period_start, minutes_used, jobs, egress_bytes)
         VALUES ($1, date_trunc('month', now())::date, 0, 0, 0)
         ON CONFLICT (tenant_id) DO NOTHING`,
        [completion.tenantId],
      );
      await client.query(
        `UPDATE public.usage_counters
         SET minutes_used = minutes_used + $2,
             egress_bytes = egress_bytes + $3
         WHERE tenant_id = $1`,
        [completion.tenantId, minutesUsed, egressBytes],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}