import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps, MouseEvent } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-md font-display font-semibold whitespace-nowrap select-none',
    'transition-[background-color,box-shadow,transform] duration-[var(--duration-base)] ease-standard',
    'active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0',
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-60 disabled:cursor-not-allowed disabled:opacity-60',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg shadow-sm hover:bg-primary-hover',
        secondary:
          'border-2 border-border-strong bg-surface text-fg hover:bg-surface-alt hover:border-fg',
        ghost: 'bg-transparent text-fg hover:bg-surface-alt',
        destructive: 'bg-danger text-danger-fg shadow-sm hover:brightness-95',
      },
      size: {
        sm: 'min-h-11 px-4 text-[0.9375rem]',
        md: 'min-h-12 px-6 text-base',
        lg: 'min-h-14 px-8 text-lg',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Muestra un indicador de carga, marca `aria-busy` y bloquea nuevos clics. */
  loading?: boolean;
  /** Texto accesible anunciado mientras carga (opcional). */
  loadingLabel?: string;
  /** Renderiza el hijo (p. ej. un enlace) con los estilos del botón. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  loadingLabel,
  asChild = false,
  disabled,
  onClick,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const blocked = loading || disabled;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    if (process.env.NODE_ENV !== 'production' && (loading || disabled)) {
      // `loading` y `disabled` no tienen efecto sobre un hijo que no es un <button>.
      console.warn(
        '[Button] `loading` y `disabled` se ignoran con `asChild`: el hijo no se bloquea. ' +
          'Renderiza un <button> o gestiona el estado en el hijo (p. ej. aria-disabled).',
      );
    }
    return (
      <Slot.Root className={classes} {...(props as ComponentProps<'span'>)}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-loading={loading || undefined}
      data-blocked={blocked || undefined}
      onClick={handleClick}
      {...props}
    >
      {loading && (
        <Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
      )}
      {children}
      {loading && loadingLabel ? <span className="sr-only">{loadingLabel}</span> : null}
    </button>
  );
}
