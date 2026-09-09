export function apiStartupMetadata(env: NodeJS.ProcessEnv = process.env) {
  return {
    env: env.NODE_ENV || 'development',
    revision: env.REVISION || 'unknown',
    stripeLiveKeyPresent:
      env.NODE_ENV === 'production' ? Boolean(env.STRIPE_SECRET_KEY_LIVE) : false,
  };
}