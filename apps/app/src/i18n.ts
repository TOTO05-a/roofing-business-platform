import { dictionaries, locales } from '@roofing/shared/i18n';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

function syncHtmlLang(lng: string | undefined): void {
  document.documentElement.lang = (lng ?? 'es').split('-')[0] ?? 'es';
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: dictionaries.es },
      en: { translation: dictionaries.en },
    },
    supportedLngs: [...locales],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    fallbackLng: 'es',
    // localStorage primero (elección del usuario) y luego el idioma del navegador.
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'lang',
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

syncHtmlLang(i18n.resolvedLanguage);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
