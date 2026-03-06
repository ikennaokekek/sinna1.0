export function getNodeEnv(): string {
  return process.env.NODE_ENV || 'development';
}

export function isProduction(): boolean {
  return getNodeEnv() === 'production';
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required but missing. Add it to your environment (.env or host env).`);
  }
  return value;
}

export function getStripeSecretKeyLive(): string {
  // Prefer *_LIVE; fall back to STRIPE_SECRET_KEY for environments without split keys
  return process.env.STRIPE_SECRET_KEY_LIVE || requireEnv('STRIPE_SECRET_KEY');
}

export function getStripeWebhookSecretLive(): string {
  // Prefer *_LIVE; fall back to STRIPE_WEBHOOK_SECRET for environments without split keys
  return process.env.STRIPE_WEBHOOK_SECRET_LIVE || requireEnv('STRIPE_WEBHOOK_SECRET');
}

/** Stripe mode from STRIPE_SECRET_KEY prefix. Same code path for test and live. */
export function getStripeMode(): 'test' | 'live' {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (key.startsWith('sk_test_')) return 'test';
  if (key.startsWith('sk_live_')) return 'live';
  return 'test';
}

/**
 * Startup validation: Stripe + onboarding env. Throws if invalid.
 * Logs Stripe mode; in test mode warns on possible webhook secret mismatch.
 */
export function validateStripeAndOnboardingEnv(log: {
  info: (o: unknown, msg?: string) => void;
  warn: (o: unknown, msg?: string) => void;
}): void {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const onboardUrl = process.env.ONBOARD_SERVICE_URL;

  if (!stripeKey || typeof stripeKey !== 'string') {
    throw new Error('STRIPE_SECRET_KEY is required. Set it in your environment (.env or host).');
  }
  if (stripeKey.startsWith('sk_test_')) {
    log.info({ stripeMode: 'test' }, 'Running in Stripe TEST mode');
  } else if (stripeKey.startsWith('sk_live_')) {
    log.info({ stripeMode: 'live' }, 'Running in Stripe LIVE mode');
  } else {
    throw new Error('STRIPE_SECRET_KEY must start with sk_test_ or sk_live_. Invalid key prefix.');
  }

  if (!webhookSecret || typeof webhookSecret !== 'string') {
    throw new Error('STRIPE_WEBHOOK_SECRET is required. Set it in your environment (.env or host).');
  }
  if (!internalSecret || typeof internalSecret !== 'string') {
    throw new Error('INTERNAL_SERVICE_SECRET is required for onboarding. Set it in your environment.');
  }
  if (!onboardUrl || typeof onboardUrl !== 'string') {
    throw new Error('ONBOARD_SERVICE_URL is required for onboarding. Set it in your environment.');
  }

  if (stripeKey.startsWith('sk_test_') && webhookSecret.length < 20) {
    log.warn(
      { webhookSecretLength: webhookSecret.length },
      'Possible Stripe mode mismatch between secret key and webhook secret.'
    );
  }
}

