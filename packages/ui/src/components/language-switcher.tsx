import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export interface LanguageOption {
  /** Código de idioma BCP 47 (p. ej. `es`). */
  code: string;
  /** Nombre del idioma en su propia lengua (p. ej. `Español`). */
  name: string;
  /** Texto corto visible (p. ej. `ES`). */
  short?: string;
}

export interface LanguageSwitcherProps extends Omit<ComponentProps<'div'>, 'onChange'> {
  options: readonly LanguageOption[];
  value: string;
  onChange: (code: string) => void;
  /** Nombre accesible del grupo (p. ej. "Idioma"). */
  label: string;
}

/**
 * Selector de idioma como grupo de botones con `aria-pressed`.
 * No conoce i18n: la aplicación decide qué hacer en `onChange`.
 */
export function LanguageSwitcher({
  options,
  value,
  onChange,
  label,
  className,
  ...props
}: LanguageSwitcherProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex rounded-md border border-border-strong p-0.5', className)}
      {...props}
    >
      {options.map((o) => {
        const active = o.code === value;
        return (
          <button
            key={o.code}
            type="button"
            lang={o.code}
            aria-pressed={active}
            aria-label={o.name}
            onClick={() => {
              if (!active) onChange(o.code);
            }}
            className={cn(
              'inline-flex min-h-10 min-w-11 items-center justify-center rounded-[calc(var(--radius-md)-2px)] px-2.5 font-display text-sm font-bold',
              'transition-colors duration-[var(--duration-fast)]',
              active ? 'bg-surface-brand text-on-brand' : 'text-fg hover:bg-surface-alt',
            )}
          >
            {o.short ?? o.code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
