export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];

export const ui = {
  es: {
    title: 'Plataforma de roofing',
    heading: 'Techos que duran',
    intro: 'Sitio público en construcción. Pronto encontrarás aquí nuestros servicios.',
    language: 'Idioma',
    skip: 'Saltar al contenido',
  },
  en: {
    title: 'Roofing platform',
    heading: 'Roofs that last',
    intro: 'Public site under construction. Our services will be listed here soon.',
    language: 'Language',
    skip: 'Skip to content',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export const languageNames: Record<Locale, string> = { es: 'Español', en: 'English' };
