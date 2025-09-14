import { z } from 'zod';

export const JobCreateInputSchema = z.object({
  source_url: z.string().url(),
  preset_id: z.string().optional(),
});

export type JobCreateInput = z.infer<typeof JobCreateInputSchema>;


