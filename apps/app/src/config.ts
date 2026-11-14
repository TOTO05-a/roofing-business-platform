/** Desarrollo local (`vite dev`). */
export const isDev = import.meta.env.DEV;

/**
 * El catálogo de componentes (`/componentes`) solo existe en desarrollo
 * o si se compila con `VITE_ENABLE_SHOWCASE=true` (p. ej. el job e2e de la CI).
 */
export const showcaseEnabled = isDev || import.meta.env.VITE_ENABLE_SHOWCASE === 'true';
