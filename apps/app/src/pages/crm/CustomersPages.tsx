import { Card, CardContent, EmptyState } from '@roofing/ui';
import { MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  useAppointmentsOf,
  useCustomer,
  useCustomers,
  useInspectionsOf,
  useProperties,
  useProperty,
} from '../../api/crm';
import type { Appointment } from '../../api/types';
import {
  AppointmentStatusBadge,
  Info,
  ListSkeleton,
  LoadError,
  Pager,
  cardLink,
  formatAddress,
  fullName,
} from '../../components/crm/ui';
import { useRole } from '../../role';

export function CustomersPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const query = useCustomers({ page });
  if (query.isPending) return <ListSkeleton />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.customers.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-7" />}
        title={t('app.crm.customers.empty')}
        description={t('app.crm.customers.emptyText')}
      />
    );
  }
  return (
    <section className="grid gap-4">
      <p className="text-sm text-fg-muted">
        {t('app.crm.common.results', { count: query.data.total })}
      </p>
      <ul className="grid gap-3">
        {query.data.customers.map((c) => (
          <li key={c.id}>
            <Link to={`/clientes/${c.id}`} className={cardLink}>
              <span className="font-display text-lg font-bold">{fullName(c)}</span>
              <span className="mt-1 block text-fg-muted">
                {[c.email, c.phone].filter(Boolean).join(' · ') || t('app.crm.common.noData')}
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
    </section>
  );
}

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const query = useCustomer(id);
  const properties = useProperties({ customerId: id, page: 1, pageSize: 50 });
  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) {
    return (
      <LoadError error={query.error} onRetry={() => void query.refetch()} backTo="/clientes" />
    );
  }
  const c = query.data;
  return (
    <div className="grid gap-6">
      <h2 className="font-display text-2xl font-bold">{fullName(c)}</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="grid gap-4 p-6">
            <h3 className="font-display text-lg font-bold">{t('app.crm.customers.contact')}</h3>
            <dl className="grid gap-3">
              <Info label={t('app.crm.fields.email')}>{c.email ?? t('app.crm.common.noData')}</Info>
              <Info label={t('app.crm.fields.phone')}>{c.phone ?? t('app.crm.common.noData')}</Info>
              {c.preferredContact ? (
                <Info label={t('app.crm.fields.preferredContact')}>
                  {t(`app.crm.contactMethod.${c.preferredContact}`)}
                </Info>
              ) : null}
              <Info label={t('app.crm.fields.marketing')}>
                {c.marketingOptIn ? t('app.crm.common.yes') : t('app.crm.common.no')}
              </Info>
              <p>
                {c.userId ? t('app.crm.customers.hasAccount') : t('app.crm.customers.noAccount')}
              </p>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-3 p-6">
            <h3 className="font-display text-lg font-bold">
              {t('app.crm.customers.propertiesTitle')}
            </h3>
            {properties.isPending ? (
              <ListSkeleton rows={1} />
            ) : properties.isError ? (
              <LoadError error={properties.error} onRetry={() => void properties.refetch()} />
            ) : properties.data.properties.length === 0 ? (
              <p className="text-fg-muted">{t('app.crm.customers.noProperties')}</p>
            ) : (
              <ul className="grid gap-2">
                {properties.data.properties.map((p) => (
                  <li key={p.id}>
                    <Link to={`/propiedades/${p.id}`} className={cardLink}>
                      {formatAddress(p)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <AppointmentsCard
        filters={{ customerId: id }}
        title={t('app.crm.customers.appointmentsTitle')}
        empty={t('app.crm.customers.noAppointments')}
      />
    </div>
  );
}

function AppointmentsCard({
  filters,
  title,
  empty,
}: {
  filters: { propertyId?: string; customerId?: string };
  title: string;
  empty: string;
}) {
  const { t, i18n } = useTranslation();
  const query = useAppointmentsOf(filters);
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const rows: Appointment[] = query.data ?? [];
  return (
    <Card>
      <CardContent className="grid gap-3 p-6">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        {query.isPending ? (
          <ListSkeleton rows={1} />
        ) : query.isError ? (
          <LoadError error={query.error} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <p className="text-fg-muted">{empty}</p>
        ) : (
          <ul className="grid gap-2">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {t(`app.crm.appointmentType.${a.type}`)} · {fmt.format(new Date(a.startsAt))}
                </span>
                <AppointmentStatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PropertiesPage() {
  const { t } = useTranslation();
  const { role } = useRole();
  const [page, setPage] = useState(1);
  const query = useProperties({ page });
  if (query.isPending) return <ListSkeleton />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.properties.length === 0) {
    const employee = role === 'empleado';
    return (
      <EmptyState
        icon={<MapPin className="size-7" />}
        title={employee ? t('app.crm.properties.emptyEmployee') : t('app.crm.properties.empty')}
        description={
          employee ? t('app.crm.properties.emptyEmployeeText') : t('app.crm.properties.emptyText')
        }
      />
    );
  }
  return (
    <section className="grid gap-4">
      <p className="text-sm text-fg-muted">
        {t('app.crm.common.results', { count: query.data.total })}
      </p>
      <ul className="grid gap-3">
        {query.data.properties.map((p) => (
          <li key={p.id}>
            <Link to={`/propiedades/${p.id}`} className={cardLink}>
              <span className="font-display text-lg font-bold">{p.addressLine1}</span>
              <span className="mt-1 block text-fg-muted">
                {formatAddress({ city: p.city, state: p.state, zip: p.zip })}
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
    </section>
  );
}

export function PropertyDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { role } = useRole();
  const query = useProperty(id);
  const inspections = useInspectionsOf(id);
  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) {
    return (
      <LoadError error={query.error} onRetry={() => void query.refetch()} backTo="/propiedades" />
    );
  }
  const p = query.data;
  return (
    <div className="grid gap-6">
      <h2 className="font-display text-2xl font-bold">{p.addressLine1}</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="grid gap-4 p-6">
            <dl className="grid gap-3">
              <Info label={t('app.crm.fields.address1')}>{formatAddress(p)}</Info>
              {p.yearBuilt ? (
                <Info label={t('app.crm.fields.yearBuilt')}>{p.yearBuilt}</Info>
              ) : null}
              {p.notes ? (
                <Info label={t('app.crm.properties.internalNotes')}>{p.notes}</Info>
              ) : null}
              {role === 'administrador' || role === 'superadministrador' ? (
                <Info label={t('app.crm.properties.owner')}>
                  <Link className="underline" to={`/clientes/${p.customerId}`}>
                    {t('app.crm.leads.viewCustomer')}
                  </Link>
                </Info>
              ) : null}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-3 p-6">
            <h3 className="font-display text-lg font-bold">
              {t('app.crm.properties.inspectionsTitle')}
            </h3>
            {inspections.isPending ? (
              <ListSkeleton rows={1} />
            ) : inspections.isError ? (
              role === 'cliente' ? null : (
                <LoadError error={inspections.error} onRetry={() => void inspections.refetch()} />
              )
            ) : inspections.data.length === 0 ? (
              <p className="text-fg-muted">{t('app.crm.properties.noInspections')}</p>
            ) : (
              <ul className="grid gap-2">
                {inspections.data.map((i) => (
                  <li key={i.id}>
                    <Link className="underline" to={`/inspecciones/${i.id}`}>
                      {t('app.crm.inspections.title', {
                        date: new Date(i.createdAt).toLocaleDateString(),
                      })}{' '}
                      · {t(`app.crm.inspections.status${i.status}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <AppointmentsCard
        filters={{ propertyId: id }}
        title={t('app.crm.properties.appointmentsTitle')}
        empty={t('app.crm.properties.noAppointments')}
      />
    </div>
  );
}
