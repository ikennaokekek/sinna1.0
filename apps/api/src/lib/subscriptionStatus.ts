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