import type { Dictionary } from '@roofing/shared/i18n';
import {
  getRoofMaterial,
  roofMaterials,
  type LocalizedText,
  type RoofMaterial,
  type RoofMaterialId,
  type RoofShape,
} from '@roofing/shared/visualizer';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import { useCallback, useId, useRef, useState, type CSSProperties } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../components/button';
import { VIEWBOX } from './geometry';
import { HouseBackdrop, SCENE_VARS } from './house-scene';
import { Downspouts, RoofLayer, type RoofSpec } from './roof-layer';
import { textureRegistry } from './textures';

type Locale = keyof LocalizedText;

export type RoofVisualizerLabels = Dictionary['visualizer'];

export interface RoofVisualizerProps {
  locale: Locale;
  /** Textos (sección `visualizer` del diccionario). */
  labels: RoofVisualizerLabels;
  /** Destino del botón "Solicitar inspección". */
  ctaHref: string;
  /** Materiales a mostrar; por defecto los de ejemplo de `@roofing/shared`. */
  materials?: readonly RoofMaterial[];
  defaultShape?: RoofShape;
  defaultMaterial?: RoofMaterialId;
  className?: string;
}

interface Selection {
  shape: RoofShape;
  materialId: RoofMaterialId;
  colorId: string;
}

interface Layer {
  id: number;
  spec: RoofSpec;
  /** `wipe`: aparece de abajo hacia arriba (cambio de material); `fade`: se funde; `none`: instantáneo. */
  mode: 'wipe' | 'fade' | 'none';
}

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');

function specOf(sel: Selection, materials: readonly RoofMaterial[]): RoofSpec {
  const material =
    materials.find((x) => x.id === sel.materialId) ?? getRoofMaterial(sel.materialId);
  const color = material.colors.find((c) => c.id === sel.colorId) ?? material.colors[0];
  return {
    shape: sel.shape,
    material: material.id,
    hex: color?.hex ?? '#555555',
    textureUrl: material.textureUrl ?? textureRegistry[material.id],
  };
}

const itemBase =
  'relative flex min-h-11 items-center gap-3 rounded-md border-2 bg-surface px-3 py-2 text-start text-fg ' +
  'transition-[border-color,background-color] duration-[var(--duration-base)] ease-standard motion-reduce:transition-none ' +
  'hover:bg-surface-alt data-[state=checked]:border-primary data-[state=checked]:bg-surface-alt border-border-strong';

function ShapeIcon({ shape }: { shape: RoofShape }) {
  return (
    <svg viewBox="0 0 48 28" aria-hidden="true" className="h-7 w-12 shrink-0" fill="none">
      {shape === 'gable' ? (
        <path
          d="M3 24 12 6h24l9 18Z"
          style={{ fill: 'var(--border-strong)' }}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M3 24 15 6h18l12 18Z M15 6l-4 18M33 6l4 18"
          style={{ fill: 'var(--border-strong)' }}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * Visualizador de techos: casa vectorial con forma (dos / cuatro aguas), material y color
 * intercambiables. Accesible con teclado y lectores de pantalla; respeta "reducir movimiento".
 */
export function RoofVisualizer({
  locale,
  labels,
  ctaHref,
  materials = roofMaterials,
  defaultShape = 'gable',
  defaultMaterial,
  className,
}: RoofVisualizerProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const firstMaterial = materials[0];
  const initialMaterial = defaultMaterial ?? firstMaterial?.id ?? 'architectural-shingle';

  const [sel, setSel] = useState<Selection>(() => ({
    shape: defaultShape,
    materialId: initialMaterial,
    colorId:
      (materials.find((x) => x.id === initialMaterial) ?? getRoofMaterial(initialMaterial))
        .colors[0]?.id ?? '',
  }));
  const counter = useRef(0);
  const [layers, setLayers] = useState<Layer[]>(() => [
    { id: 0, spec: specOf(sel, materials), mode: 'none' },
  ]);

  const commit = useCallback(
    (next: Selection) => {
      const prevMaterial = sel.materialId;
      setSel(next);
      const id = ++counter.current;
      const spec = specOf(next, materials);
      if (reduce) {
        setLayers([{ id, spec, mode: 'none' }]);
      } else {
        const mode = next.materialId !== prevMaterial ? 'wipe' : 'fade';
        setLayers((current) => [...current, { id, spec, mode }]);
      }
    },
    [sel.materialId, materials, reduce],
  );

  const material =
    materials.find((x) => x.id === sel.materialId) ?? getRoofMaterial(sel.materialId);
  const color = material.colors.find((c) => c.id === sel.colorId) ?? material.colors[0];
  const materialName = material.name[locale];
  const colorName = color?.name[locale] ?? '';
  const shapeName = sel.shape === 'gable' ? labels.shapeGable : labels.shapeHip;

  const announce = fill(labels.announce, { material: materialName, color: colorName });
  const description = fill(labels.svgDescription, {
    shape: shapeName.toLowerCase(),
    material: materialName.toLowerCase(),
    color: colorName.toLowerCase(),
  });

  const ids = {
    title: `${uid}-t`,
    desc: `${uid}-d`,
    shape: `${uid}-shape`,
    mat: `${uid}-mat`,
    col: `${uid}-col`,
  };

  return (
    <div
      className={cn(
        'grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start',
        className,
      )}
    >
      <figure className="m-0 grid gap-3">
        <div className="overflow-hidden rounded-xl border border-border shadow-md">
          <LazyMotion features={domAnimation} strict>
            <svg
              viewBox={VIEWBOX}
              role="img"
              aria-labelledby={ids.title}
              aria-describedby={ids.desc}
              className="block h-auto w-full"
              style={SCENE_VARS as CSSProperties}
              data-shape={sel.shape}
            >
              <title id={ids.title}>{labels.svgTitle}</title>
              <desc id={ids.desc}>{description}</desc>
              <HouseBackdrop />
              {layers.map((layer) => (
                <m.g
                  key={layer.id}
                  initial={
                    layer.mode === 'wipe'
                      ? { clipPath: 'inset(100% 0% 0% 0%)', opacity: 0.35 }
                      : layer.mode === 'fade'
                        ? { opacity: 0 }
                        : false
                  }
                  animate={{ clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }}
                  transition={{
                    duration: layer.mode === 'wipe' ? 0.7 : 0.45,
                    ease: [0.05, 0.7, 0.1, 1],
                  }}
                  onAnimationComplete={() =>
                    setLayers((current) => current.filter((l) => l.id >= layer.id))
                  }
                >
                  <RoofLayer spec={layer.spec} uid={`${uid}${layer.id}`} />
                </m.g>
              ))}
              <Downspouts />
            </svg>
          </LazyMotion>
        </div>
        <figcaption>
          <p role="status" aria-live="polite" className="font-display text-lg font-semibold">
            {announce}
          </p>
          <p className="mt-1 text-sm text-fg-muted">{labels.note}</p>
        </figcaption>
      </figure>

      <div className="grid gap-6">
        <div className="grid min-w-0 gap-2">
          <p id={ids.shape} className="mb-1 font-display text-base font-bold">
            {labels.shapeLabel}
          </p>
          <RadioGroup.Root
            aria-labelledby={ids.shape}
            value={sel.shape}
            onValueChange={(v) => commit({ ...sel, shape: v as RoofShape })}
            className="grid grid-cols-2 gap-2"
          >
            {(['gable', 'hip'] as const).map((shape) => (
              <RadioGroup.Item key={shape} value={shape} className={itemBase}>
                <ShapeIcon shape={shape} />
                <span className="font-semibold">
                  {shape === 'gable' ? labels.shapeGable : labels.shapeHip}
                </span>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </div>

        <div className="grid min-w-0 gap-2">
          <p id={ids.mat} className="mb-1 font-display text-base font-bold">
            {labels.materialLabel}
          </p>
          <RadioGroup.Root
            aria-labelledby={ids.mat}
            value={sel.materialId}
            onValueChange={(v) => {
              const next = materials.find((x) => x.id === v);
              if (!next) return;
              commit({ ...sel, materialId: next.id, colorId: next.colors[0]?.id ?? '' });
            }}
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
          >
            {materials.map((mat) => (
              <RadioGroup.Item
                key={mat.id}
                value={mat.id}
                className={cn(itemBase, 'font-semibold')}
              >
                <span className="grow leading-snug">{mat.name[locale]}</span>
                <RadioGroup.Indicator>
                  <Check aria-hidden="true" className="size-5 text-primary" />
                </RadioGroup.Indicator>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </div>

        <div className="grid min-w-0 gap-2">
          <p id={ids.col} className="mb-1 font-display text-base font-bold">
            {labels.colorLabel}
          </p>
          <RadioGroup.Root
            aria-labelledby={ids.col}
            value={sel.colorId}
            onValueChange={(v) => commit({ ...sel, colorId: v })}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {material.colors.map((c) => (
              <RadioGroup.Item key={c.id} value={c.id} className={cn(itemBase, 'min-h-12')}>
                <span
                  aria-hidden="true"
                  className="size-7 shrink-0 rounded-full border border-border-strong shadow-sm"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="text-sm leading-tight font-semibold">{c.name[locale]}</span>
                <RadioGroup.Indicator className="absolute end-1 top-1">
                  <Check aria-hidden="true" className="size-4 text-primary" />
                </RadioGroup.Indicator>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </div>

        <Button asChild size="lg" className="w-full sm:w-auto">
          <a href={ctaHref}>{labels.cta}</a>
        </Button>
      </div>
    </div>
  );
}
