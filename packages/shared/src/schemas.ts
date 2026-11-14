import { z } from 'zod';
import { locales } from './i18n/locales.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const localeSchema = z.enum(locales);
export type Locale = z.infer<typeof localeSchema>;
