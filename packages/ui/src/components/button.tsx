import type { VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps, MouseEvent } from 'react';
import { cn } from '../lib/cn';
import { buttonVariants } from './button-variants';

export { buttonVariants };

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
