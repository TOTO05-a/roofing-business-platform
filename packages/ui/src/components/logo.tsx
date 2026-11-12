import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export type LogoVariant = 'horizontal' | 'compact' | 'icon';

export interface LogoProps extends Omit<ComponentProps<'span'>, 'children'> {
  variant?: LogoVariant;
  /** Nombre accesible; por defecto el nombre de marca provisional. */
  label?: string;
}

/** Cresta de techo estilizada: dos chevrones (alero en `currentColor`, cumbrera en cobre). */
export function LogoMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('size-9 shrink-0', className)}
      {...props}
    >
      <path d="M5 27 24 10l19 17" stroke="currentColor" />
      <path d="M13 38l11-10 11 10" stroke="var(--primary, #b45309)" />
    </svg>
  );
}

/**
 * Logotipo provisional "Cresta Roofing".
 * Variantes: `horizontal` (icono + nombre + descriptor), `compact` (icono + nombre) e `icon`.
 * Hereda el color del texto (`currentColor`) y usa el token `--primary` para el acento.
 */
export function Logo({ variant = 'horizontal', label = 'Cresta Roofing', className, ...props }: LogoProps) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex items-center gap-2.5 text-current', className)}
      {...props}
    >
      <LogoMark className={variant === 'icon' ? 'size-10' : undefined} />
      {variant !== 'icon' && (
        <span aria-hidden="true" className="flex flex-col leading-none">
          <span className="font-display text-xl font-extrabold tracking-tight">Cresta</span>
          {variant === 'horizontal' && (
            <span className="mt-1 text-[0.6875rem] font-semibold tracking-[0.28em] uppercase opacity-80">
              Roofing
            </span>
          )}
        </span>
      )}
    </span>
  );
}
