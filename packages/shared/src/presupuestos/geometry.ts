import type { RoofMeasurements, RoofSummary } from './schemas.js';

/** Pies cuadrados por square de techo. */
export const SQ_FT_PER_SQUARE = 100;

/** Factor de pendiente estándar: sqrt(1 + (rise/12)²). Con rise 0 vale 1. */
export function pitchFactor(pitchRise: number): number {
  return Math.sqrt(1 + (pitchRise / 12) ** 2);
}

/**
 * Resume las medidas: convierte el área proyectada en planta (`PLAN`) a área real con el
 * factor de pendiente (las secciones ya declaradas como reales no se modifican),
 * suma todas las secciones y expresa el total en squares. El desperdicio se aplica
 * después, por línea de material.
 */
export function summarizeRoof(measurements: RoofMeasurements): RoofSummary {
  const surfaceAreaSqFt = measurements.sections.reduce(
    (total, section) =>
      total +
      (section.areaKind === 'PLAN'
        ? section.areaSqFt * pitchFactor(section.pitchRise)
        : section.areaSqFt),
    0,
  );
  return { surfaceAreaSqFt, squares: surfaceAreaSqFt / SQ_FT_PER_SQUARE };
}
