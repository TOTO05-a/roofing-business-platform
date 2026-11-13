import type { Dictionary } from '@roofing/shared/i18n';
import {
  getRoofMaterial,
  roofMaterials,
  type LocalizedText,
  type RoofMaterial,
  type RoofMaterialId,
  type RoofShape,
} from '@roofing/shared/visualizer';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { useCallback, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { buttonVariants } from '../components/button-variants';
import { VIEWBOX } from './geometry';
import { HouseBackdrop, SCENE_VARS, sidingId } from './house-scene';
import { Downspouts, RoofLayer, type RoofSpec } from './roof-layer';
import { TransitionLayer, usePrefersReducedMotion, type TransitionMode } from './roof-transitions';
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
  /** `wipe` en el cambio de material, `fade` en color y forma, `none` sin animación. */
  mode: TransitionMode;
  /** La capa va a ser reemplazada por otra de distinta silueta: se funde a opacidad 0. */
  leaving: boolean;
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
  'relative flex min-h-11 items-center gap-3 rounded-md border-2 border-border-strong bg-surface px-3 py-2 text-start text-fg ' +
  'transition-[border-color,background-color] duration-[var(--duration-base)] ease-standard motion-reduce:transition-none hover:bg-surface-alt';
/** Opción elegida: borde del color primario más grueso (anillo interior) y fondo; además lleva ✓. */
const itemChecked = 'border-primary bg-surface-alt shadow-[inset_0_0_0_2px_var(--primary)]';

/** Grupo de radios nativos: `fieldset` + `legend`, con navegación por flechas del propio navegador. */
function OptionGroup({
  legend,
  className,
  children,
}: {
  legend: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <fieldset role="radiogroup" className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-3 p-0 font-display text-base font-bold">{legend}</legend>
      <div className={clsx('grid gap-2', className)}>{children}</div>
    </fieldset>
  );
}

/** Opción: etiqueta de al menos 44 px con el radio nativo (transparente) cubriéndola entera. */
function Option({
  name,
  value,
  checked,
  onSelect,
  className,
  markClassName,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  className?: string;
  markClassName: string;
  children: ReactNode;
}) {
  return (
    <label className={clsx(itemBase, checked && itemChecked, className)}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="absolute -inset-0.5 m-0 h-[calc(100%+4px)] w-[calc(100%+4px)] cursor-pointer appearance-none rounded-md opacity-0"
      />
      {children}
      {checked && <Check aria-hidden="true" className={clsx('text-primary', markClassName)} />}
    </label>
  );
}

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
  const reduce = usePrefersReducedMotion();
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
    { id: 0, spec: specOf(sel, materials), mode: 'none', leaving: false },
  ]);

  const commit = useCallback(
    (next: Selection) => {
      setSel(next);
      const id = ++counter.current;
      const spec = specOf(next, materials);
      if (reduce) {
        setLayers([{ id, spec, mode: 'none', leaving: false }]);
        return;
      }
      const mode = next.materialId !== sel.materialId ? 'wipe' : 'fade';
      // Si cambia la silueta, la capa saliente se funde a 0 mientras entra la nueva.
      const leaving = next.shape !== sel.shape;
      setLayers((current) => [
        ...current.map((l) => (leaving ? { ...l, leaving } : l)),
        { id, spec, mode, leaving: false },
      ]);
    },
    [sel.materialId, sel.shape, materials, reduce],
  );

  const removeBefore = useCallback(
    (id: number) => setLayers((current) => current.filter((l) => l.id >= id)),
    [],
  );

  const material =
    materials.find((x) => x.id === sel.materialId) ?? getRoofMaterial(sel.materialId);
  const color = material.colors.find((c) => c.id === sel.colorId) ?? material.colors[0];
  const materialName = material.name[locale];
  const colorName = color?.name[locale] ?? '';
  const shapeName = sel.shape === 'gable' ? labels.shapeGable : labels.shapeHip;

  const announce = fill(labels.announce, {
    shape: shapeName.toLowerCase(),
    material: materialName,
    color: colorName,
  });
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

  const ctaClass = buttonVariants({ size: 'lg', className: 'w-full sm:w-auto' });

  return (
    <div
      className={clsx(
        'grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start',
        className,
      )}
    >
      <figure className="m-0 grid gap-3">
        <div className="overflow-hidden rounded-xl border border-border shadow-md">
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
            <HouseBackdrop uid={uid} />
            {layers.map((layer) => (
              <TransitionLayer
                key={layer.id}
                mode={layer.mode}
                leaving={layer.leaving}
                onEntered={() => removeBefore(layer.id)}
              >
                <RoofLayer spec={layer.spec} uid={`${uid}-${layer.id}`} sidingId={sidingId(uid)} />
              </TransitionLayer>
            ))}
            <Downspouts />
          </svg>
        </div>
        <figcaption>
          <p role="status" aria-live="polite" className="font-display text-lg font-semibold">
            {announce}
          </p>
          <p className="mt-1 text-sm text-fg-muted">{labels.note}</p>
        </figcaption>
      </figure>

      <div className="grid gap-6">
        <OptionGroup legend={labels.shapeLabel} className="grid-cols-2">
          {(['gable', 'hip'] as const).map((shape) => (
            <Option
              key={shape}
              name={ids.shape}
              value={shape}
              checked={sel.shape === shape}
              onSelect={(v) => commit({ ...sel, shape: v as RoofShape })}
              markClassName="ms-auto size-5 shrink-0"
            >
              <ShapeIcon shape={shape} />
              <span className="font-semibold">
                {shape === 'gable' ? labels.shapeGable : labels.shapeHip}
              </span>
            </Option>
          ))}
        </OptionGroup>

        <OptionGroup
          legend={labels.materialLabel}
          className="sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
        >
          {materials.map((mat) => (
            <Option
              key={mat.id}
              name={ids.mat}
              value={mat.id}
              checked={sel.materialId === mat.id}
              onSelect={() =>
                commit({ ...sel, materialId: mat.id, colorId: mat.colors[0]?.id ?? '' })
              }
              className="font-semibold"
              markClassName="size-5 shrink-0"
            >
              <span className="grow leading-snug">{mat.name[locale]}</span>
            </Option>
          ))}
        </OptionGroup>

        <OptionGroup legend={labels.colorLabel} className="grid-cols-2 sm:grid-cols-3">
          {material.colors.map((c) => (
            <Option
              key={c.id}
              name={ids.col}
              value={c.id}
              checked={sel.colorId === c.id}
              onSelect={(v) => commit({ ...sel, colorId: v })}
              className="min-h-12"
              markClassName="absolute end-1 top-1 size-4"
            >
              <span
                aria-hidden="true"
                className="size-7 shrink-0 rounded-full border border-border-strong shadow-sm"
                style={{ backgroundColor: c.hex }}
              />
              <span className="text-sm leading-tight font-semibold">{c.name[locale]}</span>
            </Option>
          ))}
        </OptionGroup>

        <a href={ctaHref} className={ctaClass}>
          {labels.cta}
        </a>
      </div>
    </div>
  );
}
