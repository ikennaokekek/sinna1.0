import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDb, withConnection, clientQuery, poolQuery } = vi.hoisted(() => ({
  getDb: vi.fn(),
  withConnection: vi.fn(),
  clientQuery: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock('../lib/db', () => ({ getDb, withConnection }));

import { requeueStripeWebhookEvent } from './reconcileStripeWebhookInbox';

describe('Stripe webhook operator reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDb.mockReturnValue({ pool: { query: poolQuery } });
    withConnection.mockImplementation(async (work) => {
      let quarantineError: Error | undefined;
      return work(
        { query: clientQuery },
        {
          quarantine(error: Error) {
            quarantineError ??= error;
          },
          isQuarantined() {
            return quarantineError !== undefined;
          },
        },
      );
    });
  });

  it('rechecks the immutable operation ledger after an ambiguous COMMIT backend exits', async () => {
    clientQuery.mockImplementation(async ({ text }: { text: string }) => {
      if (text.includes('pg_backend_pid')) return { rows: [{ pid: 4321 }] };
      if (text === 'COMMIT') throw new Error('Query read timeout');
      if (text.includes('UPDATE stripe_webhook_events')) return { rows: [{ event_id: 'evt_race' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    let ledgerReads = 0;
    poolQuery.mockImplementation(async ({ text }: { text: string }) => {
      if (text.includes('stripe_webhook_requeue_operations')) {
        ledgerReads++;
        return { rows: ledgerReads === 1 ? [] : [{ '?column?': 1 }], rowCount: ledgerReads === 1 ? 0 : 1 };
      }
      if (text.includes('pg_stat_activity')) return { rows: [], rowCount: 0 };
      throw new Error(`Unexpected settlement query: ${text}`);
    });

    await expect(requeueStripeWebhookEvent('evt_race')).resolves.toBe('requeued');
    expect(ledgerReads).toBe(2);
    expect(clientQuery.mock.calls.some(([query]) => query.text === 'ROLLBACK')).toBe(false);
  });
});