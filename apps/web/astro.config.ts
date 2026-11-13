import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

const isProductionBuild = Boolean(process.env.CI) || process.env.NODE_ENV === 'production';
const site =
  process.env.PUBLIC_SITE_URL ?? (isProductionBuild ? undefined : 'http://localhost:4321');

if (!site) {
  throw new Error(
    'Falta PUBLIC_SITE_URL en un build de producción. Defínela (p. ej. https://www.ejemplo.com): ' +
      'se usa para las URL canónicas, hreflang y el mapa del sitio.',
  );
}

export default defineConfig({
  output: 'static',
  site,
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
