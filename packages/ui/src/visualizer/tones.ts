/*
 * Los tonos derivan del color elegido (`--roof`) con `color-mix`; no hay colores fijos
 * salvo negro/blanco como mezcla neutra de luz y sombra.
 */
export const dark = (pct: number) => `color-mix(in srgb, var(--roof) ${100 - pct}%, black)`;
export const light = (pct: number) => `color-mix(in srgb, var(--roof) ${100 - pct}%, white)`;
