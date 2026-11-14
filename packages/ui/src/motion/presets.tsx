import { MotionConfig, type Transition, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

/** Duraciones en segundos; reflejan los tokens CSS `--duration-*`. */
export const duration = { fast: 0.12, base: 0.2, slow: 0.32, slower: 0.5 } as const;

/** Curvas; reflejan `--ease-standard` y `--ease-emphasized`. */
export const ease = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.05, 0.7, 0.1, 1],
} as const;

const standard: Transition = { duration: duration.base, ease: ease.standard };
const emphasized: Transition = { duration: duration.slow, ease: ease.emphasized };

/** Presets compartidos. Solo animan `opacity` y `transform`. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: standard },
  exit: { opacity: 0, transition: { duration: duration.fast, ease: ease.standard } },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: emphasized },
  exit: { opacity: 0, y: -8, transition: { duration: duration.fast, ease: ease.standard } },
};

export const slideInStart: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: emphasized },
  exit: { opacity: 0, x: -16, transition: { duration: duration.fast, ease: ease.standard } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: emphasized },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.fast, ease: ease.standard } },
};

/** Contenedor que escalona la aparición de sus hijos (que usen `slideUp`, `fade`, etc.). */
export const stagger = (gap = 0.06, delayChildren = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: gap, delayChildren } },
});

/**
 * Proveedor de movimiento: respeta "reducir movimiento" del sistema (`reducedMotion="user"`),
 * con lo que las animaciones de transformación se desactivan.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
