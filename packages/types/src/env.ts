import { z } from 'zod';

export const EnvSchema = z
  .object({
    R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
    R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
    R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
    R2_BUCKET: z.string().min(1, 'R2_BUCKET is required'),

    REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
    // BASE_URL is deprecated, use BASE_URL_PUBLIC instead
    BASE_URL: z.string().url('BASE_URL must be a valid URL').optional(),
    BASE_URL_PUBLIC: z.string().url('BASE_URL_PUBLIC must be a valid URL').optional(),
    BASE_URL_PRIVATE: z.string().url('BASE_URL_PRIVATE must be a valid URL').optional(),

    TRUST_PROXIES: z.string().optional(),
    TRUSTED_CIDRS: z.string().optional(),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_STANDARD_PRICE_ID: z.string().min(1, 'STRIPE_STANDARD_PRICE_ID is required'),

    CLOUDINARY_URL: z.string().url('CLOUDINARY_URL must be a valid URL'),

    ASSEMBLYAI_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),

    RESEND_API_KEY: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),
    NOTIFY_FROM_EMAIL: z.string().optional(),

    WEBHOOK_SIGNING_SECRET: z.string().min(1, 'WEBHOOK_SIGNING_SECRET is required').optional(),
    WEBHOOK_HMAC_HEADER: z.string().optional(),
  })
  .refine((vals) => Boolean(vals.ASSEMBLYAI_API_KEY) || Boolean(vals.OPENAI_API_KEY), {
    message: 'Either ASSEMBLYAI_API_KEY or OPENAI_API_KEY must be set',
    path: ['ASSEMBLYAI_API_KEY'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): Env {
  // Allow more lenient validation in development/test mode
  const isDevelopment = env.NODE_ENV === 'development' || env.NODE_ENV === 'test' || env.STRIPE_TESTING === 'true';
  
  if (isDevelopment) {
    console.warn('🔧 Running in development mode - using lenient environment validation');
    // For development, just return the env as-is and let the app handle missing values gracefully
    return env as any;
  }
  
  // Strict validation for production
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}


