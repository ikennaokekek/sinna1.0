import { z } from 'zod';

export const EnvSchema = z
  .object({
    R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
    R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
    R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
    R2_BUCKET: z.string().min(1, 'R2_BUCKET is required'),

    REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
    BASE_URL: z.string().url('BASE_URL must be a valid URL'),

    TRUST_PROXIES: z.string().optional(),
    TRUSTED_CIDRS: z.string().optional(),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_SECRET_KEY_LIVE: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_WEBHOOK_SECRET_LIVE: z.string().optional(),
    STRIPE_STANDARD_PRICE_ID: z.string().min(1, 'STRIPE_STANDARD_PRICE_ID is required'),

    CLOUDINARY_URL: z.string().url('CLOUDINARY_URL must be a valid URL'),

    ASSEMBLYAI_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),

    WEBHOOK_SIGNING_SECRET: z.string().min(1, 'WEBHOOK_SIGNING_SECRET is required'),
    WEBHOOK_HMAC_HEADER: z.string().optional(),
  })
  .refine((vals) => Boolean(vals.ASSEMBLYAI_API_KEY) || Boolean(vals.OPENAI_API_KEY), {
    message: 'Either ASSEMBLYAI_API_KEY or OPENAI_API_KEY must be set',
    path: ['ASSEMBLYAI_API_KEY'],
  })
  .refine((vals) => Boolean(vals.STRIPE_SECRET_KEY) || Boolean(vals.STRIPE_SECRET_KEY_LIVE), {
    message: 'STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_LIVE must be set',
    path: ['STRIPE_SECRET_KEY'],
  })
  .refine((vals) => Boolean(vals.STRIPE_WEBHOOK_SECRET) || Boolean(vals.STRIPE_WEBHOOK_SECRET_LIVE), {
    message: 'STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET_LIVE must be set',
    path: ['STRIPE_WEBHOOK_SECRET'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}


