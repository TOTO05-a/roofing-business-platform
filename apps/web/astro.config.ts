import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321',
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  vite: { plugins: [tailwindcss()] },
});
