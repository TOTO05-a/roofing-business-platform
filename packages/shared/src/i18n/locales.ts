/** Idiomas admitidos. Sin dependencias, para no arrastrar zod al cliente. */
export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];
