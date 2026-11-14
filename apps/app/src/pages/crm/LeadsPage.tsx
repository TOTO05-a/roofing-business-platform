import { EmptyState, FormField, Select } from '@roofing/ui';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useLeads } from '../../api/crm';
import { LEAD_SOURCES, LEAD_STATUSES, type LeadSource, type LeadStatus } from '../../api/types';
import {
  LeadStatusBadge,
  ListSkeleton,
  LoadError,
  Pager,
  cardLink,
  formatAddress,
  fullName,
} from '../../components/crm/ui';
import { useRole } from '../../role';

const ALL = 'all';

export function LeadsPage() {
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const [status, setStatus] = useState<string>(ALL);
  const [source, setSource] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const query = useLeads({
    status: status === ALL ? undefined : (status as LeadStatus),
    source: source === ALL ? undefined : (source as LeadSource),
    page,
  });
  const filtered = status !== ALL || source !== ALL;

  const statusOptions = [
    { value: ALL, label: t('app.crm.common.all') },
    ...LEAD_STATUSES.map((s) => ({ value: s, label: t(`app.crm.leadStatus.${s}`) })),
  ];
  const sourceOptions = [
    { value: ALL, label: t('app.crm.common.allFem') },
    ...LEAD_SOURCES.map((s) => ({ value: s, label: t(`app.crm.leadSource.${s}`) })),
  ];
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <section aria-label={t('app.crm.leads.filters')} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('app.crm.fields.status')}>
          {(c) => (
            <Select
              {...c}
              options={statusOptions}
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            />
          )}
        </FormField>
        <FormField label={t('app.crm.fields.source')}>
          {(c) => (
            <Select
              {...c}
              options={sourceOptions}
              value={source}
              onValueChange={(v) => {
                setSource(v);
                setPage(1);
              }}
            />
          )}
        </FormField>
      </div>

      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.leads.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="size-7" />}
          title={
            filtered
              ? t('app.crm.leads.emptyFiltered')
              : role === 'empleado'
                ? t('app.crm.leads.emptyEmployee')
                : t('app.crm.leads.empty')
          }
          description={
            filtered
              ? t('app.crm.leads.emptyFilteredText')
              : role === 'empleado'
                ? t('app.crm.leads.emptyEmployeeText')
                : t('app.crm.leads.emptyText')
          }
        />
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            {t('app.crm.common.results', { count: query.data.total })}
          </p>
          <ul className="grid gap-3">
            {query.data.leads.map((lead) => (
              <li key={lead.id}>
                <Link to={`/leads/${lead.id}`} className={cardLink}>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-lg font-bold">{fullName(lead)}</span>
                    <LeadStatusBadge status={lead.status} />
                  </span>
                  <span className="mt-1 block text-fg-muted">
                    {[lead.email, lead.phone].filter(Boolean).join(' · ')}
                  </span>
                  <span className="mt-1 block text-sm text-fg-muted">
                    {t(`app.crm.leadSource.${lead.source}`)} ·{' '}
                    {t('app.crm.leads.received', { date: date.format(new Date(lead.createdAt)) })}
                    {lead.city ? ` · ${formatAddress({ city: lead.city, state: lead.state })}` : ''}
                  </span>
                </Link>
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
    </section>
  );
}
