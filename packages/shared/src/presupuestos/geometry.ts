import type { RoofMeasurements, RoofSummary } from './schemas.js';

/** Pies cuadrados por square de techo. */
export const SQ_FT_PER_SQUARE = 100;

/** Factor de pendiente estándar: sqrt(1 + (rise/12)²). Con rise 0 vale 1. */
export function pitchFactor(pitchRise: number): number {
  return Math.sqrt(1 + (pitchRise / 12) ** 2);
}

/**
 * Resume las medidas: convierte el área proyectada en planta a área real con el
 * factor de pendiente (las secciones ya declaradas como reales no se modifican),
 * suma todas las secciones y expresa el total en squares, con y sin desperdicio.
 */
export function summarizeRoof(measurements: RoofMeasurements, wasteBps: number): RoofSummary {
  const surfaceAreaSqFt = measurements.sections.reduce(
    (total, section) =>
      total +
      (section.areaKind === 'plan'
        ? section.areaSqFt * pitchFactor(section.pitchRise)
        : section.areaSqFt),
    0,
  );
  const squares = surfaceAreaSqFt / SQ_FT_PER_SQUARE;
  return {
    surfaceAreaSqFt,
    squares,
    squaresWithWaste: squares * (1 + wasteBps / 10_000),
  };
}
