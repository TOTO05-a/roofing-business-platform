import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export interface SpinnerProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** Texto para lectores de pantalla (obligatorio: no hay texto por defecto). */
  label: string;
}

export function Spinner({ label, className, ...props }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center', className)} {...props}>
      <Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
