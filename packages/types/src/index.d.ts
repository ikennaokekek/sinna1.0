import { z } from 'zod';
export declare const JobCreateInputSchema: z.ZodObject<{
    source_url: z.ZodString;
    preset_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    source_url: string;
    preset_id?: string | undefined;
}, {
    source_url: string;
    preset_id?: string | undefined;
}>;
export type JobCreateInput = z.infer<typeof JobCreateInputSchema>;
