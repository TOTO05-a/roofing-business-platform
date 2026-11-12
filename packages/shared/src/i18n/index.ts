import { en } from './en.js';
import { localeSchema, type Locale } from '../schemas.js';
import { es, type Dictionary } from './es.js';

/** Idiomas admitidos (la misma fuente que `localeSchema`). */
export const locales = localeSchema.options;
export const defaultLocale: Locale = 'es';

export const dictionaries = { es, en } as const satisfies Record<Locale, Dictionary>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export { en, es };
export type { Dictionary };
