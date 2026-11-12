import { divRoundHalfUp, percentOfCents } from './money.js';

export interface DiscountedSubtotals {
  discountCents: number;
  materialCents: number;
  laborCents: number;
}

/**
 * Aplica el descuento al subtotal (material + mano de obra), ANTES del impuesto.
 *
 * Regla (pendiente de confirmación del usuario; aislada aquí para poder cambiarla):
 * - descuento total = subtotal × discountBps, half-up;
 * - se reparte de forma proporcional entre material y mano de obra: la parte de material
 *   es `descuento × material / subtotal` (half-up) y la de mano de obra es el resto, de modo
 *   que las dos partes siempre suman exactamente el descuento total;
 * - devuelve los subtotales ya descontados, que son la base del impuesto.
 */
export function applyDiscount(
  materialCents: number,
  laborCents: number,
  discountBps: number,
): DiscountedSubtotals {
  const subtotal = materialCents + laborCents;
  const discountCents = percentOfCents(subtotal, discountBps);
  const materialDiscount =
    subtotal === 0 ? 0 : divRoundHalfUp(discountCents * materialCents, subtotal);
  return {
    discountCents,
    materialCents: materialCents - materialDiscount,
    laborCents: laborCents - (discountCents - materialDiscount),
  };
}
