import { describe, expect, it } from 'vitest';
import {
  accelerateWipe,
  advanceWipe,
  createShapeAnim,
  retargetShape,
  SHAPE_MS,
  stepShape,
  WIPE_FINISH_MS,
  WIPE_MS,
} from './transitions';

describe('forma (T21)', () => {
  it('con el mismo destino no reinicia la animación', () => {
    const a = retargetShape(createShapeAnim(0), 1, false);
    const mid = stepShape(a, 300);
    expect(retargetShape(mid, 1, false)).toBe(mid);
  });

  it('la duración escala con la distancia restante', () => {
    const full = retargetShape(createShapeAnim(0), 1, false);
    expect(full.duration).toBe(SHAPE_MS);
    const half = stepShape(full, SHAPE_MS * 0.5);
    const back = retargetShape(half, 0, false);
    expect(back.duration).toBeCloseTo(SHAPE_MS * half.t, 6);
    expect(back.duration).toBeLessThan(SHAPE_MS);
  });

  it('al invertir a mitad de camino parte del valor actual (sin salto)', () => {
    const mid = stepShape(retargetShape(createShapeAnim(0), 1, false), 400);
    const back = retargetShape(mid, 0, false);
    expect(back.t).toBe(mid.t);
    expect(stepShape(back, 0).t).toBeCloseTo(mid.t, 9);
  });

  it('llega exactamente al destino y se detiene', () => {
    let a = retargetShape(createShapeAnim(0), 1, false);
    for (let i = 0; i < 100 && a.active; i++) a = stepShape(a, 16);
    expect(a.active).toBe(false);
    expect(a.t).toBe(1);
  });

  it('con reducir movimiento salta al destino', () => {
    const a = retargetShape(createShapeAnim(0), 1, true);
    expect(a).toMatchObject({ t: 1, active: false });
    const mid = stepShape(retargetShape(createShapeAnim(0), 1, false), 100);
    expect(retargetShape(mid, 1, true)).toMatchObject({ t: 1, active: false });
  });
});

describe('barrido (T21)', () => {
  it('avanza linealmente a ritmo normal', () => {
    expect(advanceWipe({ p: 0, rate: 1 }, WIPE_MS / 2).p).toBeCloseTo(0.5, 9);
  });

  it('acelerar no cambia el progreso y lo completa en ≈ 200 ms', () => {
    const w = accelerateWipe({ p: 0.3, rate: 1 });
    expect(w.p).toBe(0.3);
    expect(w.rate).toBeGreaterThan(1);
    const done = advanceWipe(w, WIPE_FINISH_MS);
    expect(done.p).toBeCloseTo(1, 6);
  });

  it('si ya terminaría antes, no cambia', () => {
    const w = { p: 0.95, rate: 1 };
    expect(accelerateWipe(w)).toBe(w);
  });
});
