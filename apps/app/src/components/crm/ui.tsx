import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  type BadgeProps,
} from '@roofing/ui';
import { SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AppointmentStatus, LeadStatus } from '../../api/types';
import { crmErrorKey, isNotFound } from '../../crm/errors';

/** Mensaje traducido de un fallo del CRM. */
export function useErrorText() {
  const { t } = useTranslation();
  return (error: unknown) => t(`app.crm.errors.${crmErrorKey(error)}`);
}

const leadVariant: Record<LeadStatus, BadgeProps['variant']> = {
  NEW: 'info',
  CONTACTED: 'primary',
  APPOINTMENT_SET: 'primary',
  INSPECTED: 'primary',
  QUOTED: 'warning',
  WON: 'success',
  LOST: 'danger',
  SPAM: 'neutral',
  DUPLICATE: 'neutral',
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const { t } = useTranslation();
  return <Badge variant={leadVariant[status]}>{t(`app.crm.leadStatus.${status}`)}</Badge>;
}

const appointmentVariant: Record<AppointmentStatus, BadgeProps['variant']> = {
  SCHEDULED: 'info',
  CONFIRMED: 'success',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELED: 'danger',
  NO_SHOW: 'danger',
  RESCHEDULED: 'neutral',
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant={appointmentVariant[status]}>{t(`app.crm.appointmentStatus.${status}`)}</Badge>
  );
}

/** Esqueleto de lista que anuncia la carga. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="grid gap-3">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

/** Error de carga con reintento; un 404 se muestra como «no encontrado». */
export function LoadError({
  error,
  onRetry,
  backTo,
}: {
  error: unknown;
  onRetry: () => void;
  backTo?: string;
}) {
  const { t } = useTranslation();
  const text = useErrorText();
  if (isNotFound(error) && backTo) {
    return (
      <EmptyState
        icon={<SearchX className="size-7" />}
        title={t('app.crm.common.notFoundTitle')}
        description={t('app.crm.common.notFoundText')}
        action={
          <Button asChild>
            <Link to={backTo}>{t('app.crm.common.notFoundBack')}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ErrorState
      title={t('app.crm.common.loadError')}
      description={text(error)}
      retryLabel={t('common.retry')}
      onRetry={onRetry}
      live
    />
  );
}

/** Paginación anterior/siguiente. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav
      aria-label={t('app.crm.common.pageOf', { page, pages })}
      className="flex items-center justify-between gap-3"
    >
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('app.crm.common.previous')}
      </Button>
      <p aria-live="polite" className="text-sm text-fg-muted">
        {t('app.crm.common.pageOf', { page, pages })}
      </p>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        {t('app.crm.common.next')}
      </Button>
    </nav>
  );
}

/** Diálogo con título y descripción, con desplazamiento si el contenido es largo. */
export function CrmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('common.close')}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription className="mt-1">{description}</DialogDescription> : null}
        <div className="mt-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** Fila «etiqueta: valor» de una ficha. */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-fg-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

export const cardLink =
  'block rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2';

export function fullName(person: { firstName: string; lastName?: string | null }): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

export function formatAddress(p: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const street = [p.addressLine1, p.addressLine2].filter(Boolean).join(', ');
  const place = [p.city, [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, place].filter(Boolean).join(' · ');
}
