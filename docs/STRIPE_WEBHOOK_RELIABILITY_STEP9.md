# Step 9: Stripe webhook and subscription reliability

## Ownership boundary

- **Onboarding owns commercial truth:** checkout, products/prices, customer-facing
  billing actions, subscription decisions, tenant provisioning, and one-time
  plaintext API-key delivery.
- **Core owns runtime projection:** authenticated onboarding sync and verified
  Stripe lifecycle events may update tenant authorization state. Core never
  creates checkout sessions or plaintext API keys from Stripe webhooks.

Core event ownership:

| Stripe event                    | Core behavior                                                             |
| ------------------------------- | ------------------------------------------------------------------------- |
| `invoice.payment_succeeded`     | Project active entitlement and authoritative invoice period end           |
| `invoice.payment_failed`        | Project fail-closed inactive state and bounded grace metadata             |
| `customer.subscription.updated` | Project the supported Stripe status and period end                        |
| `customer.subscription.deleted` | Project expired/inactive state                                            |
| `checkout.session.completed`    | Authenticated, durable acknowledgement only; onboarding owns all mutation |
| Any other event                 | Authenticated, durable `ignored/unsupported` record                       |

## Delivery and transaction contract

1. Core requires the exact raw request body and a valid `Stripe-Signature`.
   Production never permits the test bypass or generic-secret fallback: it
   requires `STRIPE_WEBHOOK_SECRET_LIVE` and rejects `livemode: false` events.
2. A verified event is inserted into `stripe_webhook_events` before processing.
   The row stores allowlisted event metadata, the SHA-256 digest of the exact
   signed raw bytes, attempts, lease, outcome, tenant, and retained error
   evidence. Raw Stripe payloads and customer PII are not persisted by Core.
3. Completed, ignored, dead-letter, and concurrently processing duplicates do
   not mutate tenant state again. Failed events and stale processing leases may
   be reclaimed up to five total attempts. Failed attempts use durable backoff
   eligibility of 5 seconds, 15 seconds, 1 minute, then 5 minutes; deliveries
   received before eligibility return retryable 503 without consuming an attempt.
   A database-coordinated recovery sweep autonomously reclaims stale processing
   leases and retry-eligible failures, retrieves each event through Stripe's
   authenticated Events API, revalidates immutable metadata, and uses the same
   claim-token transaction path. Recovery survives process restarts and does not
   depend on another webhook delivery.
4. Tenant projection and inbox completion use one PostgreSQL transaction with
   a 6.5-second cumulative query budget, two-second lock timeout, per-query
   PostgreSQL/client deadlines, and nine-second outer processing deadline. Any
   dispatched query that misses its application deadline quarantines and
   destroys the connection instead of returning an ambiguous transaction to the
   pool. BEGIN is rollback-protected, settled failures roll back, and no command
   is queued behind a timed-out BEGIN, query, COMMIT, or ROLLBACK. Core records
   failure only after the transaction wrapper settles.
5. `event.created` is the monotonic tenant cursor. Because Stripe timestamps have
   one-second resolution, equal-second conflicts first prefer the more
   restrictive authorization state. Equal-second events at the same restriction
   rank use immutable event ID as a stable lexical tiebreaker. The winner writes
   the complete lifecycle projection and cursor, so expiry, grace, subscription,
   status, and active state converge regardless of delivery order. Grace
   deadlines are derived from immutable `event.created`, not delivery time.
6. Missing identifiers, unsupported entitlement status, period data, tenant
   mapping, database errors, and lock/statement timeouts fail closed. Attempts
   one through four remain `failed` and return 5xx for Stripe retry. Attempt five
   becomes `dead_letter`, retains evidence, and returns 2xx to stop an unbounded
   delivery loop.
   `GRACE_DAYS` is a strict integer from 0 through 14 and defaults to 7.
7. Process-local cache updates occur only after the database transaction commits.
   Runtime API-key authorization continues to query PostgreSQL and fails closed.

Notification email is not part of the webhook transaction. Stripe/onboarding
owns customer billing communication; an email-provider outage cannot roll back a
correct tenant authorization projection.

## Recovery and reconciliation

Migrations remain explicit-only. Migration 011 locks tenant writes before its
duplicate preflight and before adding its partial unique
`stripe_subscription_id` index. If duplicate non-null values exist, the
migration rolls back with an explicit count and operator hint; resolve those
mappings before retrying.

The exact bytes of migrations 001–013 are pinned before any database connection
or migration execution. Normal CI runs migration drift, concurrent preflight,
real claim race, stale-lease, backoff/dead-letter, equal-second convergence, and
quarantined-connection tests against its disposable PostgreSQL service.

Repeated deliveries are duplicates only when the event ID, exact signed-byte
digest, event type, Stripe creation timestamp, and live-mode flag all match.
Any mismatch fails closed without storing raw payload bytes or customer data.
Invalid-signature logs contain fixed reason metadata only; Stripe verification
errors, signature headers, payloads, and attacker-controlled content are never
serialized.

List retained failures:

```bash
pnpm reconcile:stripe-webhooks list
```

After confirming the onboarding tenant mapping and commercial state, reset one
failed/dead-letter event:

```bash
pnpm reconcile:stripe-webhooks requeue evt_...
```

The autonomous recovery sweep will retry the event through Stripe's read-only
Events API; the command does not mutate billing. Requeue uses PostgreSQL-native
statement and lock timeouts inside a transaction. It reports success only after
commit; database-cancelled operations roll back, and ambiguous connection
failures are quarantined and resolved against an append-only, non-PII operation
ledger after the original backend settles. Concurrent requeue commands are
one-winner: only the effective transition records operation evidence, while
contenders return an explicit already-requeued no-op.
Operators should alert on nonzero `dead_letter` count, oldest failed age, rising
attempt counts, and tenant mapping errors. Logs include event ID/type, attempt,
outcome, terminal status, and tenant ID but never API keys or Stripe secrets.

Useful audit query:

```sql
SELECT event_id, event_type, status, attempts, next_attempt_at, outcome,
       tenant_id, last_error, updated_at
FROM stripe_webhook_events
WHERE status IN ('failed', 'dead_letter')
ORDER BY updated_at;
```
