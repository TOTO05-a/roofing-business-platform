import { dictionaries, locales, type Dictionary } from '@roofing/shared/i18n';

export { locales };
export type Locale = (typeof locales)[number];

export function getDict(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export const languageNames: Record<Locale, string> = { es: 'Español', en: 'English' };

/** Ruta equivalente en otro idioma: /es/algo -> /en/algo. */
export function alternatePath(pathname: string, to: Locale): string {
  return pathname.replace(/^\/(es|en)(?=\/|$)/, `/${to}`);
}
