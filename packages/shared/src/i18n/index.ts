import { en } from './en.js';
import { locales, type Locale } from './locales.js';
import { es, type Dictionary } from './es.js';

export const defaultLocale: Locale = 'es';

export const dictionaries = { es, en } as const satisfies Record<Locale, Dictionary>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export { en, es, locales };
export type { Dictionary };
