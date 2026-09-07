import { createHash } from 'crypto';

interface TransactionClient {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
}

// Tenant identity changes are rare control-plane operations. Serializing them
// prevents crossover syncs from locking tenant rows in opposite orders.
const TENANT_IDENTITY_MUTATION_LOCK = [0x53494e4e, 0x41544944] as const;

export function normalizeEmailIdentity(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A SHA-256-derived pair supplies 64 bits of lock space without relying on
 * JavaScript's imprecise number representation for PostgreSQL bigint values.
 */
export function emailAdvisoryLockParts(normalizedEmail: string): [number, number] {
  const digest = createHash('sha256').update(normalizedEmail, 'utf8').digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

export async function lockNormalizedEmail(
  client: TransactionClient,
  normalizedEmail: string,
): Promise<void> {
  const [first, second] = emailAdvisoryLockParts(normalizedEmail);
  await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [first, second]);
}

export async function lockTenantIdentityMutation(client: TransactionClient): Promise<void> {
  await client.query(
    'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
    [...TENANT_IDENTITY_MUTATION_LOCK],
  );
}