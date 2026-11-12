/**
 * Utilidades de redondeo del motor de presupuestos.
 *
 * POLÍTICA DE REDONDEO (única en todo el módulo):
 * - Los importes son centavos enteros. Todo cálculo monetario se hace con enteros.
 * - Cuando una operación produce fracciones de centavo (porcentajes en puntos base
 *   o cantidades fraccionarias × precio), se redondea a medio hacia arriba
 *   (half-up: 0.5 ¢ sube) y ese redondeo ocurre UNA vez por operación.
 * - Cada partida se redondea por separado y los subtotales son sumas de partidas
 *   ya redondeadas; así el desglose siempre cuadra con el total.
 * - Las cantidades de compra se redondean siempre hacia arriba (ceil), tras
 *   eliminar ruido de coma flotante (6 decimales) para no comprar una unidad de más.
 */

const BPS_DENOMINATOR = 10_000;
/** Las cantidades fraccionarias se manejan como enteros en diezmilésimas. */
export const QUANTITY_SCALE = 10_000;

/** Elimina ruido de coma flotante (p. ej. 0.1 + 0.2 = 0.30000000000000004 → 0.3). */
export function snap(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Techo de `value` tras limpiar ruido de coma flotante. */
export function ceilSnapped(value: number): number {
  return Math.ceil(snap(value));
}

/** División entera con redondeo half-up para numerador >= 0 y denominador > 0. */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** Aplica un porcentaje en puntos base a un monto en centavos (half-up). */
export function percentOfCents(amountCents: number, bps: number): number {
  return divRoundHalfUp(amountCents * bps, BPS_DENOMINATOR);
}

/** Suma un recargo en puntos base: `amount × (1 + bps/10 000)`, half-up. */
export function addMarkupCents(amountCents: number, bps: number): number {
  return divRoundHalfUp(amountCents * (BPS_DENOMINATOR + bps), BPS_DENOMINATOR);
}

/** Convierte una cantidad fraccionaria a entero en diezmilésimas (half-up). */
export function toScaledQuantity(quantity: number): number {
  return Math.floor(snap(quantity * QUANTITY_SCALE) + 0.5);
}

/** Cantidad (en diezmilésimas) × precio unitario en centavos, half-up. */
export function scaledQuantityTimesCents(scaledQuantity: number, unitCents: number): number {
  return divRoundHalfUp(scaledQuantity * unitCents, QUANTITY_SCALE);
}
