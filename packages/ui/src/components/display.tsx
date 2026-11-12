import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';

/* ---------- Card ---------- */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface text-fg shadow-sm', className)}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-6 pb-3', className)} {...props} />;
}
export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('font-display text-xl font-bold', className)} {...props} />;
}
export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-fg-muted', className)} {...props} />;
}
export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-6 pt-3', className)} {...props} />;
}
export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-3 p-6 pt-0', className)} {...props} />;
}

/* ---------- Badge ---------- */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold',
  {
    variants: {
      variant: {
        neutral: 'border-border-strong bg-surface-alt text-fg',
        primary: 'border-link bg-surface text-link',
        success: 'border-success bg-success-soft text-success',
        warning: 'border-warning bg-warning-soft text-warning',
        danger: 'border-danger bg-danger-soft text-danger',
        info: 'border-info bg-info-soft text-info',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);
export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/* ---------- Alert ---------- */
const alertVariants = cva('flex gap-3 rounded-md border-s-4 p-4 text-fg', {
  variants: {
    variant: {
      info: 'border-info bg-info-soft',
      success: 'border-success bg-success-soft',
      warning: 'border-warning bg-warning-soft',
      danger: 'border-danger bg-danger-soft',
    },
  },
  defaultVariants: { variant: 'info' },
});
const alertIcons = {
  info: { Icon: Info, color: 'text-info' },
  success: { Icon: CheckCircle2, color: 'text-success' },
  warning: { Icon: AlertTriangle, color: 'text-warning' },
  danger: { Icon: OctagonAlert, color: 'text-danger' },
} as const;

export interface AlertProps
  extends Omit<ComponentProps<'div'>, 'title'>,
    VariantProps<typeof alertVariants> {
  title?: ReactNode;
}
export function Alert({ className, variant = 'info', title, children, ...props }: AlertProps) {
  const key = variant ?? 'info';
  const { Icon, color } = alertIcons[key];
  return (
    <div
      role={key === 'danger' || key === 'warning' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', color)} />
      <div className="flex flex-col gap-0.5">
        {title ? <p className="font-display font-bold">{title}</p> : null}
        <div className="text-[0.9375rem]">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Skeleton ---------- */
/** Marcador de carga decorativo. Anuncia el estado con un contenedor `aria-busy` en el padre. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-shimmer rounded-md bg-border motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

/* ---------- Avatar ---------- */
export interface AvatarProps extends ComponentProps<typeof AvatarPrimitive.Root> {
  src?: string | undefined;
  alt?: string | undefined;
  /** Iniciales o texto de reserva. */
  fallback: string;
}
export function Avatar({ src, alt = '', fallback, className, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-brand text-on-brand',
        className,
      )}
      {...props}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={alt} className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback className="font-display text-sm font-bold" delayMs={src ? 300 : 0}>
        {fallback}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/* ---------- EmptyState ---------- */
export interface EmptyStateProps extends Omit<ComponentProps<'div'>, 'title'> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-surface-alt text-link">
          {icon}
        </div>
      ) : null}
      <p className="font-display text-lg font-bold">{title}</p>
      {description ? <p className="max-w-prose text-fg-muted">{description}</p> : null}
      {action}
    </div>
  );
}

/* ---------- ErrorState ---------- */
export interface ErrorStateProps extends Omit<ComponentProps<'div'>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  retryLabel: string;
  onRetry: () => void;
  retrying?: boolean;
}
export function ErrorState({
  title,
  description,
  retryLabel,
  onRetry,
  retrying = false,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-danger bg-danger-soft p-10 text-center',
        className,
      )}
      {...props}
    >
      <OctagonAlert aria-hidden="true" className="size-10 text-danger" />
      <p className="font-display text-lg font-bold">{title}</p>
      {description ? <p className="max-w-prose text-fg-muted">{description}</p> : null}
      <Button variant="secondary" onClick={onRetry} loading={retrying}>
        {retryLabel}
      </Button>
    </div>
  );
}
