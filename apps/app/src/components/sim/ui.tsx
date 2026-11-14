import { Alert, Badge, type BadgeProps } from '@roofing/ui';
import { useTranslation } from 'react-i18next';
import type { InvoiceStatus, ProjectStatus, QuoteStatus, StageStatus } from '../../api/demo';

const quoteVariant: Record<QuoteStatus, BadgeProps['variant']> = {
  DRAFT: 'neutral',
  SENT: 'info',
  VIEWED: 'primary',
  APPROVED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'warning',
  SUPERSEDED: 'neutral',
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const { t } = useTranslation();
  return <Badge variant={quoteVariant[status]}>{t(`app.sim.status.quote.${status}`)}</Badge>;
}

const projectVariant: Record<ProjectStatus, BadgeProps['variant']> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELED: 'danger',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useTranslation();
  return <Badge variant={projectVariant[status]}>{t(`app.sim.status.project.${status}`)}</Badge>;
}

const stageVariant: Record<StageStatus, BadgeProps['variant']> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'warning',
  DONE: 'success',
};

export function StageStatusBadge({ status }: { status: StageStatus }) {
  const { t } = useTranslation();
  return <Badge variant={stageVariant[status]}>{t(`app.sim.status.stage.${status}`)}</Badge>;
}

const invoiceVariant: Record<InvoiceStatus, BadgeProps['variant']> = {
  ISSUED: 'warning',
  PAID: 'success',
  VOID: 'neutral',
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { t } = useTranslation();
  return <Badge variant={invoiceVariant[status]}>{t(`app.sim.status.invoice.${status}`)}</Badge>;
}

/** Aviso fijo de que los datos y los pagos de la demo son simulados. */
export function SimulationNote({ text }: { text?: string }) {
  const { t } = useTranslation();
  return <Alert variant="info">{text ?? t('app.sim.demoNote')}</Alert>;
}

/** Convierte «145.50» (o «145,50») en centavos; null si no es un precio válido. */
export function dollarsToCents(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > 100_000) return null;
  return Math.round(value * 100);
}
