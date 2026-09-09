import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn } from 'child_process';
import { Pool } from 'pg';
import { getDb, resetDbClientsForTests, withConnection } from './db';
import { runMigrationCommand } from './migrationLedger';
import {
  claimStripeWebhookEvent,
  failStripeWebhookEvent,
  stripeRawPayloadSha256,
} from './stripeWebhookInbox';
import {
  applyStripeLifecycleMutation,
  recoverStripeWebhookInboxOnce,
} from '../routes/webhooks';
import { requeueStripeWebhookEvent } from '../scripts/reconcileStripeWebhookInbox';

const testUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const enabled = Boolean(
  testUrl && process.env.CONFIRM_DISPOSABLE_MIGRATION_DATABASE === 'YES',
);
let pool: Pool;
let consoleLog: ReturnType<typeof vi.spyOn>;
let previousDatabaseUrl: string | undefined;
let previousSslMode: string | undefined;

function event(id: string) {
  return {
    id,
    object: 'event' as const,
    api_version: '2023-10-16',
    created: 500,
    livemode: true,
    pending_webhooks: 0,
    request: null,
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_postgres_test', object: 'subscription' } },
  };
}

async function resetSchema(): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS public.sinna_core_schema_migrations,
      public.stripe_webhook_requeue_operations, public.stripe_webhook_events,
      public.worker_job_completions, public.api_keys, public.usage_counters, public.tenants CASCADE
  `);
}

describe.skipIf(!enabled)('Stripe webhook disposable PostgreSQL adversarial behavior', () => {
  beforeAll(async () => {
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    previousDatabaseUrl = process.env.DATABASE_URL;
    previousSslMode = process.env.DATABASE_SSL_MODE;
    process.env.DATABASE_URL = testUrl;
    process.env.DATABASE_SSL_MODE = 'disable';
    pool = new Pool({ connectionString: testUrl, max: 8 });
    await resetSchema();
    await runMigrationCommand('bootstrap', { connectionString: testUrl });
    await runMigrationCommand('apply', { connectionString: testUrl });
  });

  afterAll(async () => {
    try {
      if (pool) await resetSchema();
    } finally {
      if (pool) await pool.end();
      await getDb().pool.end();
      resetDbClientsForTests(false);
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousSslMode === undefined) delete process.env.DATABASE_SSL_MODE;
      else process.env.DATABASE_SSL_MODE = previousSslMode;
    }
  });

  it('allows one concurrent claim winner and preserves backoff and stale-lease bounds', async () => {
    const first = event('evt_concurrent_postgres');
    const digest = stripeRawPayloadSha256(Buffer.from(JSON.stringify(first)));
    const claims = await Promise.all(
      Array.from({ length: 20 }, () => claimStripeWebhookEvent(first as never, digest)),
    );
    const winners = claims.filter((claim) => claim.kind === 'claimed');
    expect(winners).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === 'duplicate')).toHaveLength(19);

    const winner = winners[0];
    if (winner.kind !== 'claimed') throw new Error('Expected claimed event');
    await failStripeWebhookEvent(first.id, winner.claimToken, new Error('transient'));
    await expect(claimStripeWebhookEvent(first as never, digest)).resolves.toMatchObject({
      kind: 'duplicate',
      status: 'failed',
      attempts: 1,
    });
    await pool.query(
      `UPDATE stripe_webhook_events SET next_attempt_at = NOW() - interval '1 second'
        WHERE event_id = $1`,
      [first.id],
    );
    await expect(claimStripeWebhookEvent(first as never, digest)).resolves.toMatchObject({
      kind: 'claimed',
      attempt: 2,
    });

    const stale = event('evt_stale_postgres');
    const staleDigest = stripeRawPayloadSha256(Buffer.from(JSON.stringify(stale)));
    await claimStripeWebhookEvent(stale as never, staleDigest);
    await pool.query(
      `UPDATE stripe_webhook_events
          SET processing_started_at = NOW() - interval '16 minutes'
        WHERE event_id = $1`,
      [stale.id],
    );
    const reclaims = await Promise.all(
      Array.from({ length: 10 }, () => claimStripeWebhookEvent(stale as never, staleDigest)),
    );
    expect(reclaims.filter((claim) => claim.kind === 'claimed')).toHaveLength(1);

    const exhausted = event('evt_exhausted_postgres');
    const exhaustedDigest = stripeRawPayloadSha256(Buffer.from(JSON.stringify(exhausted)));
    await claimStripeWebhookEvent(exhausted as never, exhaustedDigest);
    await pool.query(
      `UPDATE stripe_webhook_events
          SET attempts = 5, processing_started_at = NOW() - interval '16 minutes'
        WHERE event_id = $1`,
      [exhausted.id],
    );
    await expect(claimStripeWebhookEvent(exhausted as never, exhaustedDigest)).resolves.toMatchObject({
      kind: 'duplicate',
      status: 'dead_letter',
    });
  });

  it('fails closed on every immutable identity mismatch while accepting exact duplicates', async () => {
    const cases = [
      {
        suffix: 'digest',
        mutate: (source: ReturnType<typeof event>) => source,
        digest: 'f'.repeat(64),
        stateSql: `status = 'failed', next_attempt_at = NOW() - interval '1 second'`,
        status: 'failed',
        attempts: 1,
      },
      {
        suffix: 'type',
        mutate: (source: ReturnType<typeof event>) => ({
          ...source,
          type: 'customer.subscription.deleted',
        }),
        stateSql: `processing_started_at = NOW() - interval '16 minutes'`,
        status: 'processing',
        attempts: 1,
      },
      {
        suffix: 'created',
        mutate: (source: ReturnType<typeof event>) => ({ ...source, created: source.created + 1 }),
        stateSql: `attempts = 5, processing_started_at = NOW() - interval '16 minutes'`,
        status: 'processing',
        attempts: 5,
      },
      {
        suffix: 'livemode',
        mutate: (source: ReturnType<typeof event>) => ({ ...source, livemode: false }),
        stateSql: `status = 'completed', completed_at = NOW()`,
        status: 'completed',
        attempts: 1,
      },
    ];

    for (const identityCase of cases) {
      const original = event(`evt_identity_${identityCase.suffix}`);
      const originalDigest = stripeRawPayloadSha256(Buffer.from(JSON.stringify(original)));
      await expect(claimStripeWebhookEvent(original as never, originalDigest)).resolves.toMatchObject({
        kind: 'claimed',
        attempt: 1,
      });
      await expect(claimStripeWebhookEvent(original as never, originalDigest)).resolves.toMatchObject({
        kind: 'duplicate',
        status: 'processing',
        attempts: 1,
      });
      await pool.query(
        `UPDATE stripe_webhook_events SET ${identityCase.stateSql} WHERE event_id = $1`,
        [original.id],
      );
      const changed = identityCase.mutate(original);
      await expect(
        claimStripeWebhookEvent(
          changed as never,
          identityCase.digest || stripeRawPayloadSha256(Buffer.from(JSON.stringify(changed))),
        ),
      ).rejects.toThrow('Stripe webhook event identity conflict');
      const stored = (await pool.query(
        `SELECT event_type, event_created, livemode, payload_sha256, status, attempts
           FROM stripe_webhook_events WHERE event_id = $1`,
        [original.id],
      )).rows[0];
      expect(stored).toMatchObject({
        event_type: original.type,
        event_created: String(original.created),
        livemode: original.livemode,
        payload_sha256: originalDigest,
        attempts: identityCase.attempts,
        status: identityCase.status,
      });
    }
  });

  it('does not let a locked exhausted lease block unrelated autonomous recovery', async () => {
    const lockedEvent = event('evt_locked_exhausted_recovery');
    const lockedDigest = stripeRawPayloadSha256(Buffer.from(JSON.stringify(lockedEvent)));
    await claimStripeWebhookEvent(lockedEvent as never, lockedDigest);
    await pool.query(
      `UPDATE stripe_webhook_events
          SET attempts = 5, processing_started_at = NOW() - interval '16 minutes'
        WHERE event_id = $1`,
      [lockedEvent.id],
    );
    const eligibleEvent = event('evt_unrelated_recovery');
    const eligibleDigest = stripeRawPayloadSha256(Buffer.from(JSON.stringify(eligibleEvent)));
    const eligibleClaim = await claimStripeWebhookEvent(eligibleEvent as never, eligibleDigest);
    if (eligibleClaim.kind !== 'claimed') throw new Error('Expected eligible seed claim');
    await failStripeWebhookEvent(eligibleEvent.id, eligibleClaim.claimToken, new Error('seed'));
    await pool.query(
      `UPDATE stripe_webhook_events SET next_attempt_at = NOW() - interval '1 second'
        WHERE event_id = $1`,
      [eligibleEvent.id],
    );

    const locker = await pool.connect();
    await locker.query('BEGIN');
    await locker.query(
      'SELECT 1 FROM stripe_webhook_events WHERE event_id = $1 FOR UPDATE',
      [lockedEvent.id],
    );
    try {
      const claims = await import('./stripeWebhookInbox')
        .then(({ claimRecoverableStripeWebhookEvents }) => (
          claimRecoverableStripeWebhookEvents(10)
        ));
      expect(claims.map((claim) => claim.eventId)).toContain(eligibleEvent.id);
      expect(claims.map((claim) => claim.eventId)).not.toContain(lockedEvent.id);
    } finally {
      await locker.query('ROLLBACK');
      locker.release();
    }
  });

  it('autonomously recovers a crashed claim after an early duplicate and stale transition', async () => {
    await pool.query(
      `UPDATE stripe_webhook_events
          SET status = 'completed', claim_token = NULL, completed_at = NOW()
        WHERE status IN ('processing', 'failed')`,
    );
    const customerId = 'cus_autonomous_recovery';
    const subscriptionId = 'sub_autonomous_recovery';
    const tenant = (await pool.query(
      `INSERT INTO tenants (
         name, email, plan, active, status, stripe_customer_id, stripe_subscription_id
       ) VALUES ('autonomous-recovery', 'recovery@example.invalid', 'pro', false, 'inactive', $1, $2)
       RETURNING id`,
      [customerId, subscriptionId],
    )).rows[0];
    const recoverable = {
      ...event('evt_autonomous_recovery'),
      data: {
        object: {
          id: subscriptionId,
          object: 'subscription',
          customer: customerId,
          status: 'active',
          current_period_end: 1_800_000_000,
        },
      },
    };
    const digest = stripeRawPayloadSha256(Buffer.from(JSON.stringify(recoverable)));
    await expect(claimStripeWebhookEvent(recoverable as never, digest)).resolves.toMatchObject({
      kind: 'claimed',
      attempt: 1,
    });
    await expect(claimStripeWebhookEvent(recoverable as never, digest)).resolves.toMatchObject({
      kind: 'duplicate',
      status: 'processing',
      attempts: 1,
    });
    await getDb().pool.end();
    resetDbClientsForTests(false);
    const retrieve = vi.fn().mockResolvedValue(recoverable);
    const stripe = { events: { retrieve } } as never;
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never;
    await expect(
      recoverStripeWebhookInboxOnce(stripe, new Map(), log),
    ).resolves.toBe(0);
    expect(retrieve).not.toHaveBeenCalled();

    await pool.query(
      `UPDATE stripe_webhook_events
          SET processing_started_at = NOW() - interval '16 minutes'
        WHERE event_id = $1`,
      [recoverable.id],
    );
    const sweeps = await Promise.all([
      recoverStripeWebhookInboxOnce(stripe, new Map(), log),
      recoverStripeWebhookInboxOnce(stripe, new Map(), log),
    ]);
    expect(sweeps.sort()).toEqual([0, 1]);
    expect(retrieve).toHaveBeenCalledOnce();
    expect((await pool.query(
      `SELECT status, attempts, outcome, claim_token
         FROM stripe_webhook_events WHERE event_id = $1`,
      [recoverable.id],
    )).rows[0]).toMatchObject({
      status: 'completed',
      attempts: 2,
      outcome: 'applied',
      claim_token: expect.any(String),
    });
    expect((await pool.query(
      `SELECT status, active, expires_at, stripe_event_created, stripe_event_id
         FROM tenants WHERE id = $1`,
      [tenant.id],
    )).rows[0]).toMatchObject({
      status: 'active',
      active: true,
      expires_at: new Date(1_800_000_000_000),
      stripe_event_created: String(recoverable.created),
      stripe_event_id: recoverable.id,
    });
  });

  it('reports a locked-row requeue failure only after PostgreSQL rolls it back', async () => {
    const locked = event('evt_requeue_locked_postgres');
    const digest = stripeRawPayloadSha256(Buffer.from(JSON.stringify(locked)));
    const claim = await claimStripeWebhookEvent(locked as never, digest);
    if (claim.kind !== 'claimed') throw new Error('Expected a claimed event');
    await failStripeWebhookEvent(locked.id, claim.claimToken, new Error('seed failure'));

    const locker = await pool.connect();
    await locker.query('BEGIN');
    await locker.query(
      'SELECT 1 FROM stripe_webhook_events WHERE event_id = $1 FOR UPDATE',
      [locked.id],
    );
    try {
      const child = spawn(
        'pnpm',
        ['exec', 'tsx', 'src/scripts/reconcileStripeWebhookInbox.ts', 'requeue', locked.id],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: testUrl,
            DATABASE_SSL_MODE: 'disable',
          },
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
      });
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/canceling statement due to (lock|statement) timeout/i);
      expect(stdout).not.toContain(`Requeued ${locked.id}`);
      const lockedState = (await locker.query(
        'SELECT attempts, outcome FROM stripe_webhook_events WHERE event_id = $1',
        [locked.id],
      )).rows[0];
      expect(lockedState).toMatchObject({ attempts: 1, outcome: 'retryable_failure' });
    } finally {
      await locker.query('COMMIT');
      locker.release();
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    const durableState = (await pool.query(
      'SELECT attempts, outcome FROM stripe_webhook_events WHERE event_id = $1',
      [locked.id],
    )).rows[0];
    expect(durableState).toMatchObject({ attempts: 1, outcome: 'retryable_failure' });
    expect((await pool.query(
      'SELECT 1 FROM stripe_webhook_requeue_operations WHERE event_id = $1',
      [locked.id],
    )).rowCount).toBe(0);

    const successfulChild = spawn(
      'pnpm',
      ['exec', 'tsx', 'src/scripts/reconcileStripeWebhookInbox.ts', 'requeue', locked.id],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: testUrl,
          DATABASE_SSL_MODE: 'disable',
        },
      },
    );
    let successOutput = '';
    let successError = '';
    successfulChild.stdout.on('data', (chunk) => { successOutput += chunk; });
    successfulChild.stderr.on('data', (chunk) => { successError += chunk; });
    const successExit = await new Promise<number | null>((resolve, reject) => {
      successfulChild.once('error', reject);
      successfulChild.once('exit', resolve);
    });
    expect(successExit).toBe(0);
    expect(successError).toBe('');
    expect(successOutput).toContain(`Requeued ${locked.id}`);
    expect((await pool.query(
      `SELECT e.attempts, e.outcome, COUNT(o.operation_token)::int AS operations
         FROM stripe_webhook_events e
         JOIN stripe_webhook_requeue_operations o ON o.event_id = e.event_id
        WHERE e.event_id = $1
        GROUP BY e.attempts, e.outcome`,
      [locked.id],
    )).rows[0]).toMatchObject({
      attempts: 0,
      outcome: 'operator_requeued',
      operations: 1,
    });
  }, 15_000);

  it('allows exactly one effective concurrent operator requeue', async () => {
    const target = event('evt_requeue_concurrent_postgres');
    const digest = stripeRawPayloadSha256(Buffer.from(JSON.stringify(target)));
    const claim = await claimStripeWebhookEvent(target as never, digest);
    if (claim.kind !== 'claimed') throw new Error('Expected a claimed event');
    await failStripeWebhookEvent(target.id, claim.claimToken, new Error('seed failure'));

    const results = await Promise.all([
      requeueStripeWebhookEvent(target.id),
      requeueStripeWebhookEvent(target.id),
    ]);
    expect(results.sort()).toEqual(['already_requeued', 'requeued']);
    await expect(requeueStripeWebhookEvent(target.id)).resolves.toBe('already_requeued');
    expect((await pool.query(
      `SELECT e.status, e.attempts, e.outcome, COUNT(o.operation_token)::int AS operations
         FROM stripe_webhook_events e
         LEFT JOIN stripe_webhook_requeue_operations o ON o.event_id = e.event_id
        WHERE e.event_id = $1
        GROUP BY e.status, e.attempts, e.outcome`,
      [target.id],
    )).rows[0]).toMatchObject({
      status: 'failed',
      attempts: 0,
      outcome: 'operator_requeued',
      operations: 1,
    });
    await pool.query(
      `UPDATE stripe_webhook_events
          SET status = 'processing', claim_token = gen_random_uuid(),
              processing_started_at = NOW()
        WHERE event_id = $1`,
      [target.id],
    );
    await expect(requeueStripeWebhookEvent(target.id)).resolves.toBe('already_requeued');
    expect((await pool.query(
      'SELECT COUNT(*)::int AS operations FROM stripe_webhook_requeue_operations WHERE event_id = $1',
      [target.id],
    )).rows[0].operations).toBe(1);
  });

  it('removes a quarantined client with an in-flight PostgreSQL operation', async () => {
    let backendPid = 0;
    let pending: Promise<unknown> | undefined;
    const ambiguous = new Error('adversarial query deadline');
    await withConnection(async (client, lease) => {
      backendPid = Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      pending = client.query('SELECT pg_sleep(10)').catch((error) => error);
      lease.quarantine(ambiguous);
    });
    await pending;
    let replacementPid = 0;
    await withConnection(async (client) => {
      replacementPid = Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    });
    expect(replacementPid).not.toBe(backendPid);
  });

  it('converges equal-second active, expired, grace, and no-grace events in both orders', async () => {
    const futureGrace = new Date('2030-01-01T00:00:00.000Z');
    const cases = [
      ['active-expired', { status: 'active', active: true, graceUntil: null }, { status: 'expired', active: false, graceUntil: null }],
      ['expired-active', { status: 'expired', active: false, graceUntil: null }, { status: 'active', active: true, graceUntil: null }],
      ['grace-none', { status: 'inactive', active: false, graceUntil: futureGrace }, { status: 'inactive', active: false, graceUntil: null }],
      ['none-grace', { status: 'inactive', active: false, graceUntil: null }, { status: 'inactive', active: false, graceUntil: futureGrace }],
    ] as const;

    for (const [suffix, first, second] of cases) {
      const tenant = (await pool.query(
        `INSERT INTO tenants (
           name, email, plan, active, status, stripe_customer_id, stripe_subscription_id
         ) VALUES ($1, $2, 'pro', false, 'inactive', $3, $4)
         RETURNING id`,
        [`tenant-${suffix}`, `${suffix}@example.invalid`, `cus_${suffix}`, `sub_${suffix}`],
      )).rows[0];
      const mutation = (value: typeof first | typeof second) => ({
        ...value,
        stripeCustomerId: `cus_${suffix}`,
        stripeSubscriptionId: `sub_${suffix}`,
      });
      await applyStripeLifecycleMutation({ id: `evt_first_${suffix}`, created: 500 }, mutation(first));
      await applyStripeLifecycleMutation({ id: `evt_second_${suffix}`, created: 500 }, mutation(second));
      const row = (await pool.query(
        'SELECT active, status, grace_until FROM tenants WHERE id = $1',
        [tenant.id],
      )).rows[0];
      expect(row).toMatchObject({ active: false });
      expect(row.grace_until).toBeNull();
      if (suffix.includes('expired')) expect(row.status).toBe('expired');
    }
  });

  it('converges every equal-rank projection field by immutable event ID in both orders', async () => {
    const cases = [
      {
        suffix: 'active',
        low: {
          status: 'active',
          active: true,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          graceUntil: null,
          clearSubscription: false,
        },
        high: {
          status: 'active',
          active: true,
          expiresAt: new Date('2040-01-01T00:00:00.000Z'),
          graceUntil: null,
          clearSubscription: false,
        },
      },
      {
        suffix: 'grace',
        low: {
          status: 'inactive',
          active: false,
          expiresAt: null,
          graceUntil: new Date('2030-01-01T00:00:00.000Z'),
          clearSubscription: false,
        },
        high: {
          status: 'inactive',
          active: false,
          expiresAt: null,
          graceUntil: new Date('2040-01-01T00:00:00.000Z'),
          clearSubscription: false,
        },
      },
      {
        suffix: 'inactive',
        low: {
          status: 'inactive',
          active: false,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          graceUntil: null,
          clearSubscription: false,
        },
        high: {
          status: 'inactive',
          active: false,
          expiresAt: new Date('2040-01-01T00:00:00.000Z'),
          graceUntil: null,
          clearSubscription: false,
        },
      },
      {
        suffix: 'expired',
        low: {
          status: 'expired',
          active: false,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
          graceUntil: null,
          clearSubscription: false,
        },
        high: {
          status: 'expired',
          active: false,
          expiresAt: new Date('2040-01-01T00:00:00.000Z'),
          graceUntil: null,
          clearSubscription: true,
        },
      },
    ] as const;

    for (const testCase of cases) {
      const finalStates = [];
      for (const order of [['low', 'high'], ['high', 'low']] as const) {
        const marker = testCase.suffix;
        const customerId = `cus_rank_${marker}`;
        const subscriptionId = `sub_rank_${marker}`;
        const tenant = (await pool.query(
          `INSERT INTO tenants (
             name, email, plan, active, status, stripe_customer_id, stripe_subscription_id
           ) VALUES ($1, $2, 'pro', false, 'inactive', $3, $4)
           RETURNING id`,
          [`tenant-${marker}`, `${marker}@example.invalid`, customerId, subscriptionId],
        )).rows[0];
        for (const key of order) {
          const value = testCase[key];
          await applyStripeLifecycleMutation(
            { id: key === 'high' ? 'evt_z' : 'evt_a', created: 700 },
            {
              status: value.status,
              active: value.active,
              stripeCustomerId: customerId,
              stripeSubscriptionId: value.clearSubscription ? null : subscriptionId,
              lookupStripeSubscriptionId: value.clearSubscription ? subscriptionId : undefined,
              expiresAt: value.expiresAt,
              graceUntil: value.graceUntil,
            },
          );
        }
        finalStates.push((await pool.query(
          `SELECT status, active, expires_at, grace_until, stripe_subscription_id,
                  stripe_event_created, stripe_event_id
             FROM tenants WHERE id = $1`,
          [tenant.id],
        )).rows[0]);
        await pool.query('DELETE FROM tenants WHERE id = $1', [tenant.id]);
      }
      expect(finalStates[0]).toEqual(finalStates[1]);
      expect(finalStates[0]).toMatchObject({
        status: testCase.high.status,
        active: testCase.high.active,
        expires_at: testCase.high.expiresAt,
        grace_until: testCase.high.graceUntil,
        stripe_subscription_id: testCase.high.clearSubscription
          ? null
          : expect.stringMatching(/^sub_rank_/),
        stripe_event_created: '700',
        stripe_event_id: 'evt_z',
      });
    }
  });
});