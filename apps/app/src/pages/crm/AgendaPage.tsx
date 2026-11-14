import { Alert, Button, EmptyState, FormField, Input, Select, Textarea, toast } from '@roofing/ui';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  useAppointments,
  useAppointmentStatus,
  useCreateAppointment,
  useCustomerDirectory,
  useEmployees,
  usePropertyDirectory,
  useRescheduleAppointment,
  useStartInspection,
} from '../../api/crm';
import {
  APPOINTMENT_TYPES,
  type Appointment,
  type AppointmentStatus,
  type AppointmentType,
} from '../../api/types';
import {
  AppointmentStatusBadge,
  CrmDialog,
  Info,
  ListSkeleton,
  LoadError,
  formatAddress,
  fullName,
  useErrorText,
} from '../../components/crm/ui';
import {
  addDays,
  fromInputs,
  sameDay,
  startOfDay,
  startOfWeek,
  toDateInput,
  toTimeInput,
  validRange,
} from '../../crm/dates';
import { existingInspectionId, isOverlapError, overlapApiMessage } from '../../crm/errors';
import { appointmentActions, canReschedule, isOffice } from '../../crm/rules';
import { useRole } from '../../role';

type View = 'week' | 'list';
const LIST_WEEKS = 4;
const ALL = 'all';

/** Citas de un cliente (`/citas`, solo lectura), de un empleado o de la oficina (`/agenda`). */
export function AgendaPage() {
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const office = isOffice(role);
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [employeeId, setEmployeeId] = useState(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const createOpen = office && params.get('nuevo') === '1';

  const weeks = view === 'week' ? 1 : LIST_WEEKS;
  const from = anchor;
  const to = addDays(anchor, 7 * weeks);
  const query = useAppointments({
    from: from.toISOString(),
    to: to.toISOString(),
    assigneeId: employeeId === ALL ? undefined : employeeId,
  });
  const employees = useEmployees(role !== 'cliente');
  const properties = usePropertyDirectory();
  const customers = useCustomerDirectory(office);

  const propertyName = (id: string) => {
    const p = properties.data?.find((x) => x.id === id);
    return p ? formatAddress(p) : t('app.crm.agenda.unknownProperty');
  };
  const customerName = (id: string) => {
    const c = customers.data?.find((x) => x.id === id);
    return c ? fullName(c) : null;
  };
  const employeeName = (id: string) => employees.data?.find((e) => e.id === id)?.user.name ?? '';

  const visible = (query.data?.appointments ?? []).filter((a) => a.status !== 'RESCHEDULED');
  const selected = visible.find((a) => a.id === selectedId) ?? null;
  const timeFmt = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const dayFmt = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const rangeLabel = `${new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(from)} – ${new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(addDays(to, -1))}`;

  const days = useMemo(() => {
    const count = 7 * weeks;
    return Array.from({ length: count }, (_, i) => addDays(from, i));
  }, [from, weeks]);

  const closeCreate = () => {
    const next = new URLSearchParams(params);
    for (const key of ['nuevo', 'cliente', 'propiedad', 'lead']) next.delete(key);
    setParams(next, { replace: true });
  };

  const employeeOptions = [
    { value: ALL, label: t('app.crm.agenda.allEmployees') },
    ...(employees.data ?? []).map((e) => ({ value: e.id, label: e.user.name })),
  ];

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label={t('app.crm.agenda.viewLabel')} className="flex gap-2">
          {(['week', 'list'] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? 'primary' : 'secondary'}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {t(`app.crm.agenda.${v}`)}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="secondary"
            aria-label={t('app.crm.agenda.prev')}
            onClick={() => setAnchor(addDays(anchor, -7 * weeks))}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(startOfWeek(new Date()))}>
            {t('app.crm.agenda.today')}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label={t('app.crm.agenda.next')}
            onClick={() => setAnchor(addDays(anchor, 7 * weeks))}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </Button>
        </div>
        <p aria-live="polite" className="font-display font-bold">
          {rangeLabel}
        </p>
        <div className="ms-auto flex flex-wrap items-end gap-3">
          {office ? (
            <div className="w-56">
              <FormField label={t('app.crm.agenda.employeeFilter')}>
                {(c) => (
                  <Select
                    {...c}
                    options={employeeOptions}
                    value={employeeId}
                    onValueChange={setEmployeeId}
                  />
                )}
              </FormField>
            </div>
          ) : null}
          {office ? (
            <Button onClick={() => setParams({ nuevo: '1' })}>
              <Plus aria-hidden="true" className="size-5" />
              {t('app.crm.agenda.newAppointment')}
            </Button>
          ) : null}
        </div>
      </div>

      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-7" />}
          title={
            role === 'cliente'
              ? t('app.crm.agenda.emptyCustomer')
              : role === 'empleado'
                ? t('app.crm.agenda.emptyEmployee')
                : t('app.crm.agenda.empty')
          }
          description={
            role === 'cliente'
              ? t('app.crm.agenda.emptyCustomerText')
              : t('app.crm.agenda.emptyText')
          }
        />
      ) : (
        <div
          role="list"
          aria-label={t('app.crm.agenda.gridLabel', { range: rangeLabel })}
          className={view === 'week' ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-4' : 'grid gap-3'}
        >
          {days.map((day) => {
            const items = visible
              .filter((a) => sameDay(new Date(a.startsAt), day))
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            if (view === 'list' && items.length === 0) return null;
            const today = sameDay(day, new Date());
            return (
              <div
                key={day.toISOString()}
                role="listitem"
                className={`rounded-lg border bg-surface p-3 ${today ? 'border-primary' : 'border-border'}`}
              >
                <h3 className="font-display font-bold capitalize">
                  {dayFmt.format(day)}
                  {today ? ` · ${t('app.crm.agenda.today')}` : ''}
                </h3>
                {items.length === 0 ? (
                  <p className="mt-2 text-sm text-fg-muted">—</p>
                ) : (
                  <ul className="mt-2 grid gap-2">
                    {items.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(a.id)}
                          className="grid min-h-11 w-full gap-1 rounded-md border border-border bg-surface-alt p-2 text-start hover:border-border-strong"
                        >
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold">
                              {t('app.crm.agenda.timeRange', {
                                start: timeFmt.format(new Date(a.startsAt)),
                                end: timeFmt.format(new Date(a.endsAt)),
                              })}
                            </span>
                            <AppointmentStatusBadge status={a.status} />
                          </span>
                          <span>{t(`app.crm.appointmentType.${a.type}`)}</span>
                          <span className="text-sm text-fg-muted">
                            {propertyName(a.propertyId)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected ? (
        <DetailDialog
          key={selected.id}
          appointment={selected}
          onClose={() => setSelectedId(null)}
          propertyName={propertyName(selected.propertyId)}
          customerName={customerName(selected.customerId)}
          employeeName={employeeName(selected.assigneeId)}
          employees={employees.data ?? []}
        />
      ) : null}

      {createOpen ? (
        <CreateDialog
          onClose={closeCreate}
          initial={{
            customerId: params.get('cliente') ?? '',
            propertyId: params.get('propiedad') ?? '',
            leadId: params.get('lead') ?? '',
          }}
          customers={customers.data ?? []}
          properties={properties.data ?? []}
          employees={(employees.data ?? []).filter((e) => e.isActive)}
        />
      ) : null}
    </section>
  );
}

function ErrorAlert({ error, lang }: { error: unknown; lang: string }) {
  const { t } = useTranslation();
  const text = useErrorText();
  if (isOverlapError(error)) {
    return (
      <Alert variant="danger" role="alert">
        <div>
          <p className="font-bold">{t('app.crm.agenda.overlapTitle')}</p>
          <p>{overlapApiMessage(error, lang) ?? text(error)}</p>
          <p className="text-sm">{t('app.crm.agenda.overlapAction')}</p>
        </div>
      </Alert>
    );
  }
  return (
    <Alert variant="danger" role="alert">
      {text(error)}
    </Alert>
  );
}

type Mode = 'view' | 'cancel' | 'reschedule';

function DetailDialog({
  appointment: a,
  onClose,
  propertyName,
  customerName,
  employeeName,
  employees,
}: {
  appointment: Appointment;
  onClose: () => void;
  propertyName: string;
  customerName: string | null;
  employeeName: string;
  employees: { id: string; isActive: boolean; user: { name: string } }[];
}) {
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('view');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [date, setDate] = useState(toDateInput(new Date(a.startsAt)));
  const [start, setStart] = useState(toTimeInput(new Date(a.startsAt)));
  const [end, setEnd] = useState(toTimeInput(new Date(a.endsAt)));
  const [assigneeId, setAssigneeId] = useState(a.assigneeId);
  const [formError, setFormError] = useState<string | null>(null);
  const status = useAppointmentStatus();
  const reschedule = useRescheduleAppointment();
  const startInspection = useStartInspection();
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full', timeStyle: 'short' });
  const actions = appointmentActions(a.status, role);
  const error = status.error ?? reschedule.error ?? startInspection.error;

  const run = (to: AppointmentStatus, cancelReason?: string) =>
    status.mutate(
      cancelReason ? { id: a.id, status: to, cancelReason } : { id: a.id, status: to },
      {
        onSuccess: () => {
          toast.success(
            t('app.crm.agenda.statusChanged', { status: t(`app.crm.appointmentStatus.${to}`) }),
          );
          onClose();
        },
      },
    );

  const openInspection = () =>
    startInspection.mutate(a.id, {
      onSuccess: (inspection) => void navigate(`/inspecciones/${inspection.id}`),
      onError: (e) => {
        const existing = existingInspectionId(e);
        if (existing) void navigate(`/inspecciones/${existing}`);
      },
    });

  const submitReschedule = (event: FormEvent) => {
    event.preventDefault();
    const s = fromInputs(date, start);
    const e = fromInputs(date, end);
    if (!s || !e) return setFormError(t('app.crm.agenda.invalidDate'));
    if (!validRange(s, e)) return setFormError(t('app.crm.agenda.invalidRange'));
    setFormError(null);
    reschedule.mutate(
      { id: a.id, startsAt: s.toISOString(), endsAt: e.toISOString(), assigneeId },
      {
        onSuccess: () => {
          toast.success(t('app.crm.agenda.rescheduled', { when: fmt.format(s) }));
          onClose();
        },
      },
    );
  };

  const submitCancel = (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return setReasonError(true);
    run('CANCELED', reason.trim());
  };

  const back = () => {
    setMode('view');
    status.reset();
    reschedule.reset();
  };
  const employeeOptions = employees
    .filter((e) => e.isActive || e.id === a.assigneeId)
    .map((e) => ({ value: e.id, label: e.user.name }));

  return (
    <CrmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        mode === 'cancel'
          ? t('app.crm.agenda.cancelTitle')
          : mode === 'reschedule'
            ? t('app.crm.agenda.rescheduleTitle')
            : t('app.crm.agenda.detailTitle')
      }
      description={
        mode === 'cancel'
          ? t('app.crm.agenda.cancelText')
          : mode === 'reschedule'
            ? t('app.crm.agenda.rescheduleText')
            : fmt.format(new Date(a.startsAt))
      }
    >
      <div className="grid gap-4">
        {error ? <ErrorAlert error={error} lang={i18n.language.split('-')[0] ?? 'es'} /> : null}

        {mode === 'view' ? (
          <>
            <dl className="grid gap-3">
              <Info label={t('app.crm.fields.status')}>
                <AppointmentStatusBadge status={a.status} />{' '}
                {t(`app.crm.appointmentType.${a.type}`)}
              </Info>
              <Info label={t('app.crm.agenda.where')}>
                <Link className="underline" to={`/propiedades/${a.propertyId}`}>
                  {propertyName}
                </Link>
              </Info>
              {customerName ? (
                <Info label={t('app.crm.agenda.clientLabel')}>{customerName}</Info>
              ) : null}
              {employeeName ? <Info label={t('app.crm.agenda.who')}>{employeeName}</Info> : null}
              {a.notes ? <Info label={t('app.crm.agenda.notes')}>{a.notes}</Info> : null}
              {a.cancelReason ? (
                <Info label={t('app.crm.agenda.cancelReason')}>{a.cancelReason}</Info>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2">
              {actions
                .filter((s) => s !== 'CANCELED')
                .map((s) => (
                  <Button key={s} size="sm" loading={status.isPending} onClick={() => run(s)}>
                    {t(`app.crm.appointmentAction.${s}`)}
                  </Button>
                ))}
              {canReschedule(a.status, role) ? (
                <Button size="sm" variant="secondary" onClick={() => setMode('reschedule')}>
                  {t('app.crm.agenda.rescheduleButton')}
                </Button>
              ) : null}
              {actions.includes('CANCELED') ? (
                <Button size="sm" variant="secondary" onClick={() => setMode('cancel')}>
                  {t('app.crm.appointmentAction.CANCELED')}
                </Button>
              ) : null}
              {a.type === 'INSPECTION' &&
              role !== 'cliente' &&
              ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(a.status) ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={startInspection.isPending}
                  onClick={openInspection}
                >
                  {t('app.crm.agenda.startInspection')}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}

        {mode === 'cancel' ? (
          <form noValidate onSubmit={submitCancel} className="grid gap-4">
            <FormField
              label={t('app.crm.agenda.cancelReasonLabel')}
              required
              requiredLabel={t('common.required')}
              error={reasonError ? t('app.crm.agenda.cancelReasonRequired') : undefined}
            >
              {(c) => (
                <Textarea
                  {...c}
                  rows={3}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setReasonError(false);
                  }}
                />
              )}
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" loading={status.isPending}>
                {t('app.crm.agenda.cancelConfirm')}
              </Button>
              <Button type="button" variant="secondary" onClick={back}>
                {t('app.crm.agenda.keep')}
              </Button>
            </div>
          </form>
        ) : null}

        {mode === 'reschedule' ? (
          <form noValidate onSubmit={submitReschedule} className="grid gap-4">
            <p className="text-sm text-fg-muted">{t('app.crm.agenda.rescheduleNote')}</p>
            {formError ? (
              <Alert variant="danger" role="alert">
                {formError}
              </Alert>
            ) : null}
            <FormField
              label={t('app.crm.agenda.date')}
              required
              requiredLabel={t('common.required')}
            >
              {(c) => (
                <Input {...c} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label={t('app.crm.agenda.startTime')}
                required
                requiredLabel={t('common.required')}
              >
                {(c) => (
                  <Input
                    {...c}
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                )}
              </FormField>
              <FormField
                label={t('app.crm.agenda.endTime')}
                required
                requiredLabel={t('common.required')}
              >
                {(c) => (
                  <Input {...c} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                )}
              </FormField>
            </div>
            {employeeOptions.length > 0 ? (
              <FormField label={t('app.crm.agenda.employeeLabel')}>
                {(c) => (
                  <Select
                    {...c}
                    options={employeeOptions}
                    value={assigneeId}
                    onValueChange={setAssigneeId}
                  />
                )}
              </FormField>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={reschedule.isPending}>
                {t('app.crm.agenda.rescheduleButton')}
              </Button>
              <Button type="button" variant="secondary" onClick={back}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </CrmDialog>
  );
}

function CreateDialog({
  onClose,
  initial,
  customers,
  properties,
  employees,
}: {
  onClose: () => void;
  initial: { customerId: string; propertyId: string; leadId: string };
  customers: { id: string; firstName: string; lastName: string }[];
  properties: {
    id: string;
    customerId: string;
    addressLine1: string;
    city: string;
    state: string;
    zip: string;
  }[];
  employees: { id: string; user: { name: string } }[];
}) {
  const { t, i18n } = useTranslation();
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [propertyId, setPropertyId] = useState(initial.propertyId);
  const [assigneeId, setAssigneeId] = useState('');
  const [type, setType] = useState<AppointmentType>('INSPECTION');
  const [date, setDate] = useState(toDateInput(startOfDay(new Date())));
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useCreateAppointment();
  const lang = i18n.language.split('-')[0] ?? 'es';
  const required = t('validation.required');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const s = fromInputs(date, start);
    const e = fromInputs(date, end);
    const next: Record<string, string> = {};
    if (!customerId) next['customer'] = required;
    if (!propertyId) next['property'] = required;
    if (!assigneeId) next['assignee'] = required;
    if (!s || !e) next['date'] = t('app.crm.agenda.invalidDate');
    else if (!validRange(s, e)) next['end'] = t('app.crm.agenda.invalidRange');
    setErrors(next);
    if (Object.keys(next).length > 0 || !s || !e) return;
    mutation.mutate(
      {
        customerId,
        propertyId,
        assigneeId,
        type,
        startsAt: s.toISOString(),
        endsAt: e.toISOString(),
        leadId: initial.leadId || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            t('app.crm.agenda.created', {
              when: new Intl.DateTimeFormat(i18n.language, {
                dateStyle: 'full',
                timeStyle: 'short',
              }).format(s),
            }),
          );
          onClose();
        },
      },
    );
  };

  const req = t('common.required');
  return (
    <CrmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('app.crm.agenda.newTitle')}
      description={t('app.crm.agenda.newText')}
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        {mutation.isError ? <ErrorAlert error={mutation.error} lang={lang} /> : null}
        <FormField
          label={t('app.crm.fields.customer')}
          required
          requiredLabel={req}
          error={errors['customer']}
        >
          {(c) => (
            <Select
              {...c}
              placeholder={t('app.crm.fields.select')}
              options={customers.map((x) => ({ value: x.id, label: fullName(x) }))}
              value={customerId}
              onValueChange={(v) => {
                setCustomerId(v);
                setPropertyId('');
              }}
            />
          )}
        </FormField>
        <FormField
          label={t('app.crm.fields.property')}
          required
          requiredLabel={req}
          error={errors['property']}
        >
          {(c) => (
            <Select
              {...c}
              placeholder={t('app.crm.fields.select')}
              options={properties
                .filter((p) => p.customerId === customerId)
                .map((p) => ({ value: p.id, label: formatAddress(p) }))}
              value={propertyId}
              onValueChange={setPropertyId}
            />
          )}
        </FormField>
        <FormField
          label={t('app.crm.agenda.employeeLabel')}
          required
          requiredLabel={req}
          error={errors['assignee']}
        >
          {(c) => (
            <Select
              {...c}
              placeholder={t('app.crm.fields.select')}
              options={employees.map((e) => ({ value: e.id, label: e.user.name }))}
              value={assigneeId}
              onValueChange={setAssigneeId}
            />
          )}
        </FormField>
        <FormField label={t('app.crm.agenda.type')}>
          {(c) => (
            <Select
              {...c}
              options={APPOINTMENT_TYPES.map((x) => ({
                value: x,
                label: t(`app.crm.appointmentType.${x}`),
              }))}
              value={type}
              onValueChange={(v) => setType(v as AppointmentType)}
            />
          )}
        </FormField>
        <FormField
          label={t('app.crm.agenda.date')}
          required
          requiredLabel={req}
          error={errors['date']}
        >
          {(c) => (
            <Input {...c} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          )}
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('app.crm.agenda.startTime')} required requiredLabel={req}>
            {(c) => (
              <Input {...c} type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            )}
          </FormField>
          <FormField
            label={t('app.crm.agenda.endTime')}
            required
            requiredLabel={req}
            error={errors['end']}
          >
            {(c) => (
              <Input {...c} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            )}
          </FormField>
        </div>
        <FormField label={`${t('app.crm.agenda.notes')} (${t('app.crm.common.optional')})`}>
          {(c) => (
            <Textarea {...c} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </FormField>
        <Button type="submit" loading={mutation.isPending}>
          {t('app.crm.common.create')}
        </Button>
      </form>
    </CrmDialog>
  );
}
