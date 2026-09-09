export const externalSubscriptionStatuses = [
  'active',
  'trialing',
  'canceled',
  'unpaid',
  'expired',
  'incomplete_expired',
  'past_due',
  'incomplete',
  'paused',
] as const;

export type ExternalSubscriptionStatus = typeof externalSubscriptionStatuses[number];
export type TenantStatus = 'active' | 'inactive' | 'expired';

export function stripeGraceDays(value = process.env.GRACE_DAYS): number {
  if (value === undefined || value === '') return 7;
  if (!/^\d+$/.test(value)) throw new Error('GRACE_DAYS must be an integer between 0 and 14');
  const parsed = Number(value);
  if (parsed < 0 || parsed > 14) {
    throw new Error('GRACE_DAYS must be an integer between 0 and 14');
  }
  return parsed;
}

/** Maps only Stripe states which Core is prepared to authorize. */
export function normalizeSubscriptionStatus(status: string): TenantStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'incomplete':
    case 'paused':
      return 'inactive';
    case 'canceled':
    case 'unpaid':
    case 'expired':
    case 'incomplete_expired':
      return 'expired';
    default:
      throw new Error(`Unsupported subscription status: ${status}`);
  }
}