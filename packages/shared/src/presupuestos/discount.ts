import { divRoundHalfUp, percentOfCents } from './money.js';

export interface DiscountedSubtotals {
  discountCents: number;
  materialCents: number;
  laborCents: number;
}

/**
 * Aplica el descuento al subtotal (material + mano de obra), ANTES del impuesto.
 *
 * Regla APROBADA por el usuario (decisión 10 de docs/arquitectura/modelo-datos.md, sección 7);
 * se mantiene aislada aquí por claridad:
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
