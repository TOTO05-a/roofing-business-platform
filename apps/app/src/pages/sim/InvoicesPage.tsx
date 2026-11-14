import { Button, Card, CardContent, EmptyState, FormField, Select, toast } from '@roofing/ui';
import { Receipt } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  money,
  useInvoices,
  useSimulatePayment,
  type Invoice,
  type InvoiceStatus,
} from '../../api/demo';
import {
  CrmDialog,
  ListSkeleton,
  LoadError,
  Pager,
  fullName,
  useErrorText,
} from '../../components/crm/ui';
import { InvoiceStatusBadge, SimulationNote } from '../../components/sim/ui';
import { useRole } from '../../role';

const ALL = 'all';
const STATUSES: InvoiceStatus[] = ['ISSUED', 'PAID'];

/** Facturas SIMULADAS (anticipo y saldo): la oficina «registra» pagos de demostración. */
export function InvoicesPage() {
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const office = role === 'administrador' || role === 'superadministrador';
  const errorText = useErrorText();
  const [status, setStatus] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const query = useInvoices({
    status: status === ALL ? undefined : (status as InvoiceStatus),
    page,
  });
  const pay = useSimulatePayment();
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const options = [
    { value: ALL, label: t('app.crm.common.all') },
    ...STATUSES.map((s) => ({ value: s, label: t(`app.sim.status.invoice.${s}`) })),
  ];

  return (
    <section className="grid gap-5">
      <SimulationNote text={t('app.sim.invoices.note')} />
      <FormField label={t('app.crm.fields.status')} className="sm:max-w-xs">
        {(c) => (
          <Select
            {...c}
            options={options}
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        )}
      </FormField>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.invoices.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-7" />}
          title={status === ALL ? t('app.sim.invoices.empty') : t('app.sim.invoices.emptyFiltered')}
          description={t('app.sim.invoices.emptyText')}
        />
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            {t('app.crm.common.results', { count: query.data.total })}
          </p>
          <ul className="grid gap-3">
            {query.data.invoices.map((invoice) => (
              <li key={invoice.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="grid gap-0.5">
                      <span className="font-display text-lg font-bold">
                        {invoice.number} · {t(`app.sim.invoices.${invoice.kind}`)}
                      </span>
                      <Link
                        to={`/proyectos/${invoice.project.id}`}
                        className="text-sm text-primary underline"
                      >
                        {t('app.sim.invoices.project', { number: invoice.project.number })}
                      </Link>
                      <span className="text-sm text-fg-muted">
                        {office ? `${fullName(invoice.customer)} · ` : ''}
                        {invoice.status === 'PAID' && invoice.paidAt
                          ? t('app.sim.invoices.paidOn', {
                              date: date.format(new Date(invoice.paidAt)),
                            })
                          : t('app.sim.invoices.due', {
                              date: date.format(new Date(invoice.dueAt)),
                            })}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-display text-xl font-extrabold">
                        {money(invoice.totalCents, i18n.language)}
                      </span>
                      <InvoiceStatusBadge status={invoice.status} />
                      {office && invoice.status === 'ISSUED' && (
                        <Button size="sm" onClick={() => setPaying(invoice)}>
                          {t('app.sim.invoices.pay')}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <Pager
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            onPage={setPage}
          />
        </>
      )}
      {paying && (
        <CrmDialog
          open
          onOpenChange={(open) => !open && setPaying(null)}
          title={t('app.sim.invoices.payTitle')}
          description={t('app.sim.invoices.payText', {
            amount: money(paying.totalCents, i18n.language),
          })}
        >
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setPaying(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={pay.isPending}
              onClick={() =>
                pay.mutate(paying.id, {
                  onSuccess: () => {
                    toast.success(t('app.sim.invoices.paid'));
                    setPaying(null);
                  },
                  onError: (e) => {
                    setPaying(null);
                    toast.error(errorText(e));
                  },
                })
              }
            >
              {pay.isPending ? t('app.sim.invoices.paying') : t('app.sim.invoices.payConfirm')}
            </Button>
          </div>
        </CrmDialog>
      )}
    </section>
  );
}
