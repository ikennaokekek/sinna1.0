import { z } from 'zod';

const BaseEnvSchema = z
  .object({
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
    DATABASE_SSL_MODE: z.enum(['disable', 'require', 'verify-full']).optional(),
    DB_POOL_MAX: z.string().regex(/^\d+$/, 'DB_POOL_MAX must be an integer').optional(),
    DB_POOL_MIN: z.string().regex(/^\d+$/, 'DB_POOL_MIN must be an integer').optional(),

    R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
    R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
    R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
    R2_BUCKET: z.string().min(1, 'R2_BUCKET is required'),

    REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
    QUEUE_PREFIX: z.string().regex(/^[a-z0-9][a-z0-9:_-]{2,63}$/),
    // BASE_URL is deprecated, use BASE_URL_PUBLIC instead
    BASE_URL: z.string().url('BASE_URL must be a valid URL').optional(),
    BASE_URL_PUBLIC: z.string().url('BASE_URL_PUBLIC must be a valid URL').optional(),
    BASE_URL_PRIVATE: z.string().url('BASE_URL_PRIVATE must be a valid URL').optional(),

    TRUST_PROXIES: z.string().optional(),
    TRUSTED_CIDRS: z.string().optional(),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_SECRET_KEY_LIVE: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_WEBHOOK_SECRET_LIVE: z.string().optional(),
    GRACE_DAYS: z.string()
      .regex(/^\d+$/, 'GRACE_DAYS must be an integer')
      .refine((value) => Number(value) <= 14, 'GRACE_DAYS must be between 0 and 14')
      .optional(),

    CLOUDINARY_URL: z.string().url('CLOUDINARY_URL must be a valid URL').optional(),

    ASSEMBLYAI_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),

    RESEND_API_KEY: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),
    NOTIFY_FROM_EMAIL: z.string().optional(),

    WEBHOOK_SIGNING_SECRET: z.string().min(1, 'WEBHOOK_SIGNING_SECRET is required').optional(),
    WEBHOOK_HMAC_HEADER: z.string().optional(),
  });

export const ApiEnvSchema = BaseEnvSchema;

export const WorkerEnvSchema = BaseEnvSchema.extend({
  CLOUDINARY_URL: z.string().url('CLOUDINARY_URL must be a valid URL'),
  ASSEMBLYAI_API_KEY: z.string().min(1, 'ASSEMBLYAI_API_KEY is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  WORKER_INSTANCE_ID: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/),
  WORKER_CONCURRENCY: z.string().regex(/^\d+$/, 'WORKER_CONCURRENCY must be an integer'),
  WORKER_SHUTDOWN_TIMEOUT_MS: z.string().regex(/^\d+$/, 'WORKER_SHUTDOWN_TIMEOUT_MS must be an integer'),
});

export const EnvSchema = ApiEnvSchema;
export type Env = z.infer<typeof ApiEnvSchema>;
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function validateEnv(
  env: NodeJS.ProcessEnv = process.env,
  role: 'api' | 'worker' = 'api',
): Env | WorkerEnv {
  // Allow more lenient validation in development/test mode
  const isDevelopment = env.NODE_ENV === 'development' || env.NODE_ENV === 'test' || env.STRIPE_TESTING === 'true';
  
  if (isDevelopment) {
    console.warn('🔧 Running in development mode - using lenient environment validation');
    // For development, just return the env as-is and let the app handle missing values gracefully
    return env as any;
  }
  
  // Strict validation for production
  const parsed = (role === 'worker' ? WorkerEnvSchema : ApiEnvSchema).safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}


