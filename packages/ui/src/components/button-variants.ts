import { cva } from 'class-variance-authority';

/** Estilos del botón, sin dependencias de React: se pueden aplicar a un `<a>` o a un `<button>`. */
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
