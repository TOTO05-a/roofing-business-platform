import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const localeSchema = z.enum(['es', 'en']);
export type Locale = z.infer<typeof localeSchema>;
