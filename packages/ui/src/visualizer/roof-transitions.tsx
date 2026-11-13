import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';

/*
 * Capa de animación del visualizador, aislada del resto: aquí viven las "recetas" de cada
 * transición (Web Animations API) y el componente que las aplica. El visualizador solo decide
 * QUÉ transición usar; para añadir otra (p. ej. un giro 3D) basta con registrar una receta en
 * `TRANSITIONS` y ampliar `TransitionMode`, sin tocar la lógica de selección ni la escena.
 */

/** `wipe`: barrido de abajo hacia arriba; `fade`: fundido; `none`: instantáneo. */
export type TransitionMode = 'wipe' | 'fade' | 'none';

/** Receta de una animación de entrada. */
export interface TransitionRecipe {
  keyframes: Keyframe[];
  /** Duración en ms. */
  duration: number;
  /** Nombre del token de easing (`--ease-*`) de `packages/ui`. */
  easingToken: string;
}

export const TRANSITIONS: Record<Exclude<TransitionMode, 'none'>, TransitionRecipe> = {
  wipe: {
    keyframes: [
      { clipPath: 'inset(100% 0% 0% 0%)', opacity: 0.35 },
      { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 },
    ],
    duration: 700,
    easingToken: '--ease-emphasized',
  },
  fade: {
    keyframes: [{ opacity: 0 }, { opacity: 1 }],
    duration: 450,
    easingToken: '--ease-emphasized',
  },
};

/** Salida de una capa que será reemplazada por otra de distinta silueta (se funde a 0). */
export const LEAVE: TransitionRecipe = {
  keyframes: [{ opacity: 1 }, { opacity: 0 }],
  duration: TRANSITIONS.fade.duration,
  easingToken: '--ease-emphasized',
};

const FALLBACK_EASE = 'cubic-bezier(0.05, 0.7, 0.1, 1)';

/** Lee la curva del token de movimiento; si no está definido usa la misma curva por defecto. */
function easingOf(el: Element, token: string): string {
  const value = getComputedStyle(el).getPropertyValue(token).trim();
  return value || FALLBACK_EASE;
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduced(onChange: () => void) {
  if (typeof matchMedia !== 'function') return () => {};
  const query = matchMedia(REDUCED_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** `true` si la persona pidió reducir el movimiento (en el servidor, `false`). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => typeof matchMedia === 'function' && matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

function play(
  ref: RefObject<SVGGElement | null>,
  recipe: TransitionRecipe,
  fill: FillMode,
): Animation | null {
  const el = ref.current;
  if (!el || typeof el.animate !== 'function') return null;
  return el.animate(recipe.keyframes, {
    duration: recipe.duration,
    easing: easingOf(el, recipe.easingToken),
    fill,
  });
}

interface TransitionLayerProps {
  mode: TransitionMode;
  /** La capa será reemplazada: se funde a opacidad 0 a la vez que entra la nueva. */
  leaving: boolean;
  /** Se llama al terminar la animación de entrada (o enseguida si no hay animación posible). */
  onEntered: () => void;
  children: ReactNode;
}

/** Grupo SVG que aplica la animación de entrada y, si `leaving`, la de salida. */
export function TransitionLayer({ mode, leaving, onEntered, children }: TransitionLayerProps) {
  const ref = useRef<SVGGElement>(null);

  // Solo al montar: la animación de entrada no se repite.
  useLayoutEffect(() => {
    if (mode === 'none') return;
    const anim = play(ref, TRANSITIONS[mode], 'backwards');
    if (!anim) {
      onEntered();
      return;
    }
    anim.finished.then(onEntered, () => {});
    return () => anim.cancel();
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!leaving || !el) return;
    // Parte de la opacidad actual por si la entrada aún estaba en curso.
    const anim = play(
      ref,
      { ...LEAVE, keyframes: [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }] },
      'forwards',
    );
    return () => anim?.cancel();
  }, [leaving]);

  return <g ref={ref}>{children}</g>;
}
