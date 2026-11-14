import { Button, Card, CardContent, EmptyState, FormField, Select, toast } from '@roofing/ui';
import { FolderKanban } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useEmployees, usePhotoUrl } from '../../api/crm';
import {
  money,
  useAssignCrew,
  useProject,
  useProjects,
  useSetStage,
  type ProjectDetail,
  type ProjectStatus,
  type StageStatus,
} from '../../api/demo';
import {
  ListSkeleton,
  LoadError,
  Pager,
  cardLink,
  formatAddress,
  fullName,
  useErrorText,
} from '../../components/crm/ui';
import {
  InvoiceStatusBadge,
  ProjectStatusBadge,
  SimulationNote,
  StageStatusBadge,
} from '../../components/sim/ui';
import { useRole } from '../../role';

const ALL = 'all';
const STATUSES: ProjectStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'];

export function ProjectsPage() {
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const [status, setStatus] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const query = useProjects({
    status: status === ALL ? undefined : (status as ProjectStatus),
    page,
  });
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const options = [
    { value: ALL, label: t('app.crm.common.all') },
    ...STATUSES.map((s) => ({ value: s, label: t(`app.sim.status.project.${s}`) })),
  ];

  return (
    <section className="grid gap-5">
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
      ) : query.data.projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="size-7" />}
          title={status === ALL ? t('app.sim.projects.empty') : t('app.sim.projects.emptyFiltered')}
          description={t('app.sim.projects.emptyText')}
        />
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            {t('app.crm.common.results', { count: query.data.total })}
          </p>
          <ul className="grid gap-3">
            {query.data.projects.map((project) => {
              const done = project.stages.filter((s) => s.status === 'DONE').length;
              return (
                <li key={project.id}>
                  <Link to={`/proyectos/${project.id}`} className={cardLink}>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display text-lg font-bold">
                        {project.number} · {project.title}
                      </span>
                      <ProjectStatusBadge status={project.status} />
                    </span>
                    <span className="mt-1 block text-fg-muted">
                      {role !== 'cliente' ? `${fullName(project.customer)} · ` : ''}
                      {formatAddress(project.property)}
                    </span>
                    <span className="mt-2 block h-2 overflow-hidden rounded-full bg-surface-alt">
                      <span
                        className="block h-full bg-primary"
                        style={{ width: `${(done / Math.max(1, project.stages.length)) * 100}%` }}
                      />
                    </span>
                    <span className="mt-1 flex flex-wrap justify-between gap-2 text-sm text-fg-muted">
                      <span>
                        {t('app.sim.projects.stagesDone', { done, total: project.stages.length })}
                      </span>
                      {project.scheduledStart && (
                        <span>{date.format(new Date(project.scheduledStart))}</span>
                      )}
                      {role !== 'empleado' && (
                        <span>{money(project.contractTotalCents, i18n.language)}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
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

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const query = useProject(id);
  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) {
    return (
      <LoadError error={query.error} onRetry={() => void query.refetch()} backTo="/proyectos" />
    );
  }
  const project = query.data;
  const office = role === 'administrador' || role === 'superadministrador';
  const crewCanEdit = office || role === 'empleado';
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">
            {project.number} · {project.title}
          </h2>
          <p className="text-fg-muted">
            {role !== 'cliente' ? `${fullName(project.customer)} · ` : ''}
            {formatAddress(project.property)}
          </p>
          <p className="text-sm text-fg-muted">
            {project.scheduledStart && date.format(new Date(project.scheduledStart))}
            {project.scheduledEnd && ` → ${date.format(new Date(project.scheduledEnd))}`}
            {role !== 'empleado' &&
              ` · ${t('app.sim.projects.contract')}: ${money(project.contractTotalCents, i18n.language)}`}
          </p>
          {role !== 'empleado' && (
            <Link
              to={`/cotizaciones/${project.quote.id}`}
              className="text-sm font-semibold text-primary underline"
            >
              {t('app.sim.projects.quote', { number: project.quote.number })}
            </Link>
          )}
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      <StagesCard project={project} editable={crewCanEdit} />
      {role !== 'cliente' && <CrewCard project={project} office={office} />}
      <PhotosCard project={project} />
      {role !== 'empleado' && project.invoices.length > 0 && (
        <Card>
          <CardContent className="grid gap-3 p-6">
            <h3 className="font-display text-lg font-bold">{t('app.sim.projects.invoices')}</h3>
            <ul className="grid gap-2">
              {project.invoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {invoice.number} · {t(`app.sim.invoices.${invoice.kind}`)} ·{' '}
                    {money(invoice.totalCents, i18n.language)}
                  </span>
                  <InvoiceStatusBadge status={invoice.status} />
                </li>
              ))}
            </ul>
            <Link to="/facturas" className="text-sm font-semibold text-primary underline">
              {t('app.nav.invoices')}
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StagesCard({ project, editable }: { project: ProjectDetail; editable: boolean }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const setStage = useSetStage(project.id);
  const change = (stageId: string, status: StageStatus) =>
    setStage.mutate(
      { stageId, status },
      {
        onSuccess: () => toast.success(t('app.sim.projects.stageUpdated')),
        onError: (e) => toast.error(errorText(e)),
      },
    );
  return (
    <Card>
      <CardContent className="grid gap-3 p-6">
        <h3 className="font-display text-lg font-bold">{t('app.sim.projects.stages')}</h3>
        <ol className="grid gap-3">
          {project.stages.map((stage) => (
            <li key={stage.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-surface-alt text-sm font-bold">
                  {stage.sortOrder}
                </span>
                {stage.name}
              </span>
              <span className="flex items-center gap-2">
                <StageStatusBadge status={stage.status} />
                {editable && stage.status === 'PENDING' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => change(stage.id, 'IN_PROGRESS')}
                  >
                    {t('app.sim.projects.start')}
                  </Button>
                )}
                {editable && stage.status === 'IN_PROGRESS' && (
                  <Button size="sm" onClick={() => change(stage.id, 'DONE')}>
                    {t('app.sim.projects.complete')}
                  </Button>
                )}
                {editable && stage.status === 'DONE' && (
                  <Button size="sm" variant="ghost" onClick={() => change(stage.id, 'IN_PROGRESS')}>
                    {t('app.sim.projects.reopen')}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function CrewCard({ project, office }: { project: ProjectDetail; office: boolean }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const employees = useEmployees(office);
  const assign = useAssignCrew(project.id);
  const [employeeId, setEmployeeId] = useState('');
  const [roleValue, setRoleValue] = useState<'CREW_LEAD' | 'CREW_MEMBER'>('CREW_MEMBER');
  const assignedIds = new Set(project.assignments.map((a) => a.employeeId));
  return (
    <Card>
      <CardContent className="grid gap-3 p-6">
        <h3 className="font-display text-lg font-bold">{t('app.sim.projects.crew')}</h3>
        {project.assignments.length === 0 ? (
          <p className="text-fg-muted">{t('app.sim.projects.noCrew')}</p>
        ) : (
          <ul className="grid gap-1">
            {project.assignments.map((a) => (
              <li key={a.employeeId}>
                <strong>{a.name}</strong> ·{' '}
                {a.role === 'CREW_LEAD' ? t('app.sim.projects.lead') : t('app.sim.projects.member')}
              </li>
            ))}
          </ul>
        )}
        {office && (
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <FormField label={t('app.sim.projects.employee')}>
              {(c) => (
                <Select
                  {...c}
                  value={employeeId}
                  onValueChange={setEmployeeId}
                  options={(employees.data ?? [])
                    .filter((e) => e.isActive && !assignedIds.has(e.id))
                    .map((e) => ({ value: e.id, label: e.user.name }))}
                />
              )}
            </FormField>
            <FormField label={t('app.sim.projects.role')}>
              {(c) => (
                <Select
                  {...c}
                  value={roleValue}
                  onValueChange={(v) => setRoleValue(v as 'CREW_LEAD' | 'CREW_MEMBER')}
                  options={[
                    { value: 'CREW_MEMBER', label: t('app.sim.projects.member') },
                    { value: 'CREW_LEAD', label: t('app.sim.projects.lead') },
                  ]}
                />
              )}
            </FormField>
            <Button
              disabled={!employeeId}
              loading={assign.isPending}
              onClick={() =>
                assign.mutate(
                  { employeeId, role: roleValue },
                  {
                    onSuccess: () => {
                      toast.success(t('app.sim.projects.assigned'));
                      setEmployeeId('');
                    },
                    onError: (e) => toast.error(errorText(e)),
                  },
                )
              }
            >
              {assign.isPending ? t('app.sim.projects.assigning') : t('app.sim.projects.assign')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PhotoImage({ fileId, alt }: { fileId: string; alt: string }) {
  const url = usePhotoUrl(fileId);
  if (!url.data) return <div className="aspect-[8/5] animate-pulse rounded-md bg-surface-alt" />;
  return (
    <img
      src={url.data.url}
      alt={alt}
      loading="lazy"
      className="aspect-[8/5] w-full rounded-md object-cover"
    />
  );
}

function PhotosCard({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="grid gap-3 p-6">
        <h3 className="font-display text-lg font-bold">{t('app.sim.projects.photos')}</h3>
        {project.photos.length === 0 ? (
          <p className="text-fg-muted">{t('app.sim.projects.noPhotos')}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {project.photos.map((photo) => (
              <li key={photo.id} className="grid gap-1">
                <PhotoImage
                  fileId={photo.fileId}
                  alt={t('app.sim.projects.photoAlt', { caption: photo.caption ?? '' })}
                />
                <span className="text-sm">
                  <strong>{t(`app.sim.phase.${photo.phase}`)}</strong>
                  {photo.caption ? ` · ${photo.caption}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <SimulationNote text={t('app.sim.demoNote')} />
      </CardContent>
    </Card>
  );
}
