import { z } from 'zod';
export * from './env';
export * from './databaseSsl';
export * from './deadline';
export * from './queueRuntime';

export const JobCreateInputSchema = z.object({
  source_url: z.string().url(),
  preset_id: z.string().optional(),
});

export type JobCreateInput = z.infer<typeof JobCreateInputSchema>;


