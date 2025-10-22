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


