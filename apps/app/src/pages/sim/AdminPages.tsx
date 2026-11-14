import { Badge, Card, CardContent, EmptyState } from '@roofing/ui';
import { UserCog } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEmployees } from '../../api/crm';
import { useAdminUsers } from '../../api/demo';
import { ListSkeleton, LoadError, Pager } from '../../components/crm/ui';

/** Usuarios y roles (superadministración): lista de cuentas de la demo. */
export function UsersPage() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const query = useAdminUsers({ page });
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  if (query.isPending) return <ListSkeleton />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  const roleName = {
    CUSTOMER: t('app.roles.cliente'),
    EMPLOYEE: t('app.roles.empleado'),
    ADMIN: t('app.roles.administrador'),
    SUPERADMIN: t('app.roles.superadministrador'),
  } as const;
  return (
    <section className="grid gap-4">
      <p className="text-sm text-fg-muted">
        {t('app.crm.common.results', { count: query.data.total })}
      </p>
      {query.data.users.length === 0 ? (
        <EmptyState icon={<UserCog className="size-7" />} title={t('app.sim.users.empty')} />
      ) : (
        <ul className="grid gap-3">
          {query.data.users.map((user) => (
            <li key={user.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="grid gap-0.5">
                    <span className="font-display text-lg font-bold">{user.name}</span>
                    <span className="text-sm text-fg-muted">
                      {user.email} · {date.format(new Date(user.createdAt))}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">{roleName[user.role]}</Badge>
                    <Badge variant={user.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {user.status === 'ACTIVE'
                        ? t('app.sim.users.active')
                        : t('app.sim.users.disabled')}
                    </Badge>
                    <Badge variant={user.twoFactorEnabled ? 'success' : 'neutral'}>
                      {user.twoFactorEnabled
                        ? t('app.sim.users.twoFactorOn')
                        : t('app.sim.users.twoFactorOff')}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pager
        page={query.data.page}
        pageSize={query.data.pageSize}
        total={query.data.total}
        onPage={setPage}
      />
    </section>
  );
}

/** Empleados (oficina): quién vende, inspecciona y forma las cuadrillas. */
export function EmployeesPage() {
  const { t } = useTranslation();
  const query = useEmployees();
  if (query.isPending) return <ListSkeleton />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) {
    return (
      <EmptyState icon={<UserCog className="size-7" />} title={t('app.sim.employees.empty')} />
    );
  }
  return (
    <ul className="grid gap-3">
      {query.data.map((employee) => (
        <li key={employee.id}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="grid gap-0.5">
                <span className="font-display text-lg font-bold">{employee.user.name}</span>
                <span className="text-sm text-fg-muted">
                  {[employee.user.email, employee.phone].filter(Boolean).join(' · ')}
                </span>
              </div>
              <Badge variant={employee.isActive ? 'success' : 'neutral'}>
                {employee.isActive ? t('app.sim.users.active') : t('app.sim.users.disabled')}
              </Badge>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
