/**
 * Lógica de tiempo de las transiciones (T21), pura y sin Three.js: todas las interrupciones parten
 * del estado actual y no producen saltos.
 */

export const SHAPE_MS = 900;
export const WIPE_MS = 1100;
export const COLOR_MS = 400;
/** Duración con la que se completa un barrido interrumpido por un nuevo material. */
export const WIPE_FINISH_MS = 200;

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export interface ShapeAnim {
  /** Valor actual de `hipInset` (0 = dos aguas, 1 = cuatro aguas). */
  t: number;
  from: number;
  to: number;
  elapsed: number;
  /** Duración del tramo: proporcional a la distancia recorrida. */
  duration: number;
  active: boolean;
}

export function createShapeAnim(t: number): ShapeAnim {
  return { t, from: t, to: t, elapsed: 0, duration: 0, active: false };
}

/**
 * Nuevo destino de la forma. Devuelve el mismo objeto si no hay nada que cambiar (mismo destino:
 * no se reinicia); si no, parte de `t` actual y escala la duración por la distancia restante.
 */
export function retargetShape(a: ShapeAnim, to: number, reduced: boolean): ShapeAnim {
  if (reduced) {
    if (a.t === to && !a.active) return a;
    return { t: to, from: to, to, elapsed: 0, duration: 0, active: false };
  }
  if (to === a.to) return a;
  const distance = Math.abs(to - a.t);
  if (distance < 1e-6) return { t: to, from: to, to, elapsed: 0, duration: 0, active: false };
  return { t: a.t, from: a.t, to, elapsed: 0, duration: SHAPE_MS * distance, active: true };
}

export function stepShape(a: ShapeAnim, dtMs: number): ShapeAnim {
  if (!a.active) return a;
  const elapsed = a.elapsed + dtMs;
  const p = a.duration > 0 ? Math.min(1, elapsed / a.duration) : 1;
  if (p >= 1) return { ...a, t: a.to, elapsed, active: false };
  return { ...a, t: a.from + (a.to - a.from) * easeInOutCubic(p), elapsed };
}

export interface WipeClock {
  /** Progreso lineal 0–1 (se le aplica el easing al dibujar). */
  p: number;
  /** Velocidad relativa: 1 = duración normal. */
  rate: number;
}

export function advanceWipe(w: WipeClock, dtMs: number): WipeClock {
  return { p: Math.min(1, w.p + (dtMs * w.rate) / WIPE_MS), rate: w.rate };
}

/**
 * Acelera el barrido en curso para que termine en `finishMs` desde ahora, sin tocar el progreso
 * (no hay salto). Si ya terminaría antes, no cambia.
 */
export function accelerateWipe(w: WipeClock, finishMs = WIPE_FINISH_MS): WipeClock {
  const remaining = ((1 - w.p) * WIPE_MS) / w.rate;
  if (remaining <= finishMs) return w;
  return { p: w.p, rate: (w.rate * remaining) / finishMs };
}
