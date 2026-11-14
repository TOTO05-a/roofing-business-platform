import { Card, CardContent } from '@roofing/ui';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { money, useDashboard, type Dashboard } from '../../api/demo';
import { ListSkeleton, LoadError, formatAddress, fullName } from '../../components/crm/ui';
import { SimulationNote } from '../../components/sim/ui';
import { useRole } from '../../role';
import { useSession } from '../../session';

interface StatCardProps {
  label: string;
  value: ReactNode;
  to?: string;
}

function StatCard({ label, value, to }: StatCardProps) {
  const body = (
    <Card className="h-full transition-colors hover:border-border-strong">
      <CardContent className="grid gap-1 p-5">
        <p className="text-sm font-semibold text-fg-muted">{label}</p>
        <p className="font-display text-3xl font-extrabold">{value}</p>
      </CardContent>
    </Card>
  );
  return to ? (
    <Link to={to} className="block focus-visible:outline-2 focus-visible:outline-offset-2">
      {body}
    </Link>
  ) : (
    body
  );
}

function stats(role: string, d: Dashboard, lang: string, tr: TFunction): StatCardProps[] {
  const cents = (value: number | null) => (value === null ? '—' : money(value, lang));
  if (role === 'cliente') {
    return [
      { label: tr('app.sim.home.weekAppointments'), value: d.weekAppointments, to: '/citas' },
      { label: tr('app.sim.home.clientQuotes'), value: d.quotesSent, to: '/cotizaciones' },
      { label: tr('app.sim.home.projectsActive'), value: d.projectsActive, to: '/proyectos' },
      { label: tr('app.sim.home.clientPending'), value: cents(d.pendingCents), to: '/facturas' },
    ];
  }
  if (role === 'empleado') {
    return [
      { label: tr('app.sim.home.newLeads'), value: d.newLeads ?? 0, to: '/leads' },
      { label: tr('app.sim.home.weekAppointments'), value: d.weekAppointments, to: '/agenda' },
      { label: tr('app.sim.home.quotesSent'), value: d.quotesSent, to: '/cotizaciones' },
      { label: tr('app.sim.home.projectsActive'), value: d.projectsActive, to: '/proyectos' },
    ];
  }
  return [
    { label: tr('app.sim.home.newLeads'), value: d.newLeads ?? 0, to: '/leads' },
    { label: tr('app.sim.home.weekAppointments'), value: d.weekAppointments, to: '/agenda' },
    { label: tr('app.sim.home.quotesSent'), value: d.quotesSent, to: '/cotizaciones' },
    { label: tr('app.sim.home.quotesApproved'), value: d.quotesApproved, to: '/cotizaciones' },
    { label: tr('app.sim.home.projectsActive'), value: d.projectsActive, to: '/proyectos' },
    { label: tr('app.sim.home.projectsCompleted'), value: d.projectsCompleted, to: '/proyectos' },
    { label: tr('app.sim.home.collected'), value: cents(d.collectedCents), to: '/facturas' },
    { label: tr('app.sim.home.pending'), value: cents(d.pendingCents), to: '/facturas' },
  ];
}

/** Panel de inicio por rol: cifras reales sacadas de los datos (ficticios) de la demo. */
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const { session } = useSession();
  const query = useDashboard();
  const name = session.status === 'authenticated' ? session.user.name : '';
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-display text-2xl font-bold">{t('app.sim.home.greeting', { name })}</h2>
        <p className="text-fg-muted">{t('app.sim.home.subtitle')}</p>
      </div>
      <SimulationNote />
      {query.isPending ? (
        <ListSkeleton rows={3} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats(role, query.data, i18n.language, t).map((card) => (
              <li key={card.label}>
                <StatCard {...card} />
              </li>
            ))}
          </ul>
          <Card>
            <CardContent className="grid gap-3 p-6">
              <h3 className="font-display text-lg font-bold">{t('app.sim.home.upcoming')}</h3>
              {query.data.upcomingAppointments.length === 0 ? (
                <p className="text-fg-muted">{t('app.sim.home.noUpcoming')}</p>
              ) : (
                <ul className="grid gap-2">
                  {query.data.upcomingAppointments.map((a) => (
                    <li key={a.id} className="flex flex-wrap justify-between gap-2">
                      <span>
                        <strong>{when.format(new Date(a.startsAt))}</strong> ·{' '}
                        {t(`app.crm.appointmentType.${a.type as 'INSPECTION'}`)}
                      </span>
                      <span className="text-fg-muted">
                        {role === 'cliente'
                          ? formatAddress(a.property)
                          : `${fullName(a.customer)} · ${formatAddress(a.property)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
