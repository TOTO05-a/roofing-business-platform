import type { Locale } from './schemas.js';

const INTL_LOCALE = { es: 'es-US', en: 'en-US' } as const satisfies Record<Locale, string>;

/** Formatea un monto en dólares estadounidenses según el idioma. */
export function formatUsd(amount: number, locale: Locale = 'es'): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
