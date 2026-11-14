import type { RoofMaterialId, RoofShape } from '@roofing/shared/visualizer';

export type ViewId = 'front' | 'corner' | 'top';

/** Posiciones de cámara de cada vista (grados): giro alrededor de la fachada y ángulo desde el cénit. */
export const VIEWS: Record<ViewId, { azimuth: number; polar: number }> = {
  front: { azimuth: 0, polar: 84 },
  corner: { azimuth: 38, polar: 80 },
  top: { azimuth: 18, polar: 34 },
};

export interface Scene3DProps {
  shape: RoofShape;
  materialId: RoofMaterialId;
  colorId: string;
  /** Color del catálogo (`#rrggbb`). */
  hex: string;
  reduced: boolean;
  /** Vista activa (`null` si la persona giró la cámara a mano). */
  view: ViewId | null;
  onUserRotate: () => void;
  /** Error de WebGL (contexto perdido, sin soporte…). */
  onError: () => void;
  /** Progreso de carga de recursos (0–100). */
  onProgress: (percent: number) => void;
  /** La escena ya muestra la casa y el techo. */
  onReady: () => void;
}
