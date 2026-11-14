import {
  Alert,
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  Select,
  Textarea,
  toast,
} from '@roofing/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  useAssignLead,
  useConvertLead,
  useEmployees,
  useLead,
  useLeadStatus,
  type ConvertInput,
} from '../../api/crm';
import type { Lead, LeadStatus } from '../../api/types';
import {
  CrmDialog,
  Info,
  LeadStatusBadge,
  ListSkeleton,
  LoadError,
  formatAddress,
  fullName,
  useErrorText,
} from '../../components/crm/ui';
import { canConvert, isOffice, leadActions } from '../../crm/rules';
import { useRole } from '../../role';

const NONE = 'none';

export function LeadDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const query = useLead(id);

  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) {
    return <LoadError error={query.error} onRetry={() => void query.refetch()} backTo="/leads" />;
  }
  const lead = query.data;
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' });
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">{fullName(lead)}</h2>
          <p className="text-fg-muted">
            {t(`app.crm.leadSource.${lead.source}`)} ·{' '}
            {t('app.crm.leads.received', { date: date.format(new Date(lead.createdAt)) })}
          </p>
        </div>
        <LeadStatusBadge status={lead.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="grid gap-4 p-6">
            <h3 className="font-display text-lg font-bold">{t('app.crm.leads.contact')}</h3>
            <dl className="grid gap-3">
              <Info label={t('app.crm.fields.email')}>
                {lead.email ?? t('app.crm.common.noData')}
              </Info>
              <Info label={t('app.crm.fields.phone')}>
                {lead.phone ?? t('app.crm.common.noData')}
              </Info>
              <Info label={t('app.crm.leads.location')}>
                {formatAddress(lead) || t('app.crm.common.noData')}
              </Info>
              {lead.message ? (
                <Info label={t('app.crm.leads.formMessage')}>{lead.message}</Info>
              ) : null}
              {lead.lostReason ? (
                <Info label={t('app.crm.leads.lostReason')}>{lead.lostReason}</Info>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <StatusCard lead={lead} />
          {isOffice(role) ? <AssignCard lead={lead} /> : null}
          <ConvertCard lead={lead} />
        </div>
      </div>
    </div>
  );
}

function StatusCard({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  const { role } = useRole();
  const errorText = useErrorText();
  const mutation = useLeadStatus(lead.id);
  const [lostOpen, setLostOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const actions = leadActions(lead, role);

  const change = (status: LeadStatus, lostReason?: string) => {
    mutation.mutate(lostReason ? { status, lostReason } : { status }, {
      onSuccess: () => {
        setLostOpen(false);
        toast.success(
          t('app.crm.leads.statusChanged', { status: t(`app.crm.leadStatus.${status}`) }),
        );
      },
    });
  };
  const submitLost = (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return setReasonError(true);
    change('LOST', reason.trim());
  };

  return (
    <Card>
      <CardContent className="grid gap-4 p-6">
        <h3 className="font-display text-lg font-bold">{t('app.crm.leads.changeStatus')}</h3>
        {mutation.isError && !lostOpen ? (
          <Alert variant="danger" role="alert">
            {errorText(mutation.error)}
          </Alert>
        ) : null}
        {actions.length === 0 ? (
          <p className="text-fg-muted">{t('app.crm.leads.noActions')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action.status}
                variant={action.status === 'LOST' ? 'secondary' : 'primary'}
                size="sm"
                disabled={action.blocked !== null || mutation.isPending}
                aria-describedby={action.blocked ? `blocked-${lead.id}` : undefined}
                onClick={() =>
                  action.status === 'LOST' ? setLostOpen(true) : change(action.status)
                }
              >
                {t('app.crm.leads.moveTo', { status: t(`app.crm.leadStatus.${action.status}`) })}
              </Button>
            ))}
          </div>
        )}
        {actions.some((a) => a.blocked) ? (
          <p id={`blocked-${lead.id}`} className="text-sm text-fg-muted">
            {t('app.crm.leads.needsConversion')}
          </p>
        ) : null}
      </CardContent>

      <CrmDialog
        open={lostOpen}
        onOpenChange={(open) => {
          setLostOpen(open);
          if (!open) mutation.reset();
        }}
        title={t('app.crm.leads.lostTitle')}
        description={t('app.crm.leads.lostText')}
      >
        <form noValidate onSubmit={submitLost} className="grid gap-4">
          {mutation.isError ? (
            <Alert variant="danger" role="alert">
              {errorText(mutation.error)}
            </Alert>
          ) : null}
          <FormField
            label={t('app.crm.leads.lostReasonLabel')}
            required
            requiredLabel={t('common.required')}
            error={reasonError ? t('app.crm.leads.lostReasonRequired') : undefined}
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
          <Button type="submit" variant="destructive" loading={mutation.isPending}>
            {t('app.crm.leads.lostConfirm')}
          </Button>
        </form>
      </CrmDialog>
    </Card>
  );
}

function AssignCard({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const employees = useEmployees();
  const mutation = useAssignLead(lead.id);
  const options = [
    { value: NONE, label: t('app.crm.common.unassigned') },
    ...(employees.data ?? []).map((e) => ({ value: e.id, label: e.user.name })),
  ];
  return (
    <Card>
      <CardContent className="grid gap-4 p-6">
        <h3 className="font-display text-lg font-bold">{t('app.crm.leads.assignTitle')}</h3>
        {mutation.isError ? (
          <Alert variant="danger" role="alert">
            {errorText(mutation.error)}
          </Alert>
        ) : null}
        <FormField label={t('app.crm.fields.assignee')}>
          {(c) => (
            <Select
              {...c}
              options={options}
              value={lead.assignedToId ?? NONE}
              disabled={employees.isPending || mutation.isPending}
              onValueChange={(v) =>
                mutation.mutate(v === NONE ? null : v, {
                  onSuccess: () => toast.success(t('app.crm.leads.assigned')),
                })
              }
            />
          )}
        </FormField>
      </CardContent>
    </Card>
  );
}

function ConvertCard({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  const { role } = useRole();
  const [open, setOpen] = useState(false);

  if (lead.customerId && lead.propertyId) {
    return (
      <Card>
        <CardContent className="grid gap-3 p-6">
          <h3 className="font-display text-lg font-bold">{t('app.crm.leads.linked')}</h3>
          <div className="flex flex-wrap gap-2">
            {isOffice(role) ? (
              <Button asChild variant="secondary" size="sm">
                <Link to={`/clientes/${lead.customerId}`}>{t('app.crm.leads.viewCustomer')}</Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary" size="sm">
              <Link to={`/propiedades/${lead.propertyId}`}>{t('app.crm.leads.viewProperty')}</Link>
            </Button>
            {isOffice(role) ? (
              <Button asChild size="sm">
                <Link
                  to={`/agenda?nuevo=1&cliente=${lead.customerId}&propiedad=${lead.propertyId}&lead=${lead.id}`}
                >
                  {t('app.crm.leads.scheduleAppointment')}
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (!canConvert(lead, role)) return null;
  return (
    <Card>
      <CardContent className="grid gap-3 p-6">
        <h3 className="font-display text-lg font-bold">{t('app.crm.leads.convertTitle')}</h3>
        <p className="text-fg-muted">{t('app.crm.leads.convertText')}</p>
        <Button onClick={() => setOpen(true)} className="justify-self-start">
          {t('app.crm.leads.convertButton')}
        </Button>
      </CardContent>
      <ConvertDialog lead={lead} open={open} onOpenChange={setOpen} />
    </Card>
  );
}

function ConvertDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const mutation = useConvertLead(lead.id);
  const needsLastName = !lead.lastName;
  const needsAddress = !(lead.addressLine1 && lead.city && lead.state && lead.zip);
  const [lastName, setLastName] = useState('');
  const [address, setAddress] = useState({
    addressLine1: lead.addressLine1 ?? '',
    city: lead.city ?? '',
    state: lead.state ?? 'FL',
    zip: lead.zip ?? '',
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = {
      lastName: needsLastName && !lastName.trim(),
      addressLine1: needsAddress && !address.addressLine1.trim(),
      city: needsAddress && !address.city.trim(),
      state: needsAddress && !/^[A-Za-z]{2}$/.test(address.state.trim()),
      zip: needsAddress && !/^\d{5}(-\d{4})?$/.test(address.zip.trim()),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const body: ConvertInput = {};
    if (needsLastName) body.lastName = lastName.trim();
    if (needsAddress) {
      body.property = {
        addressLine1: address.addressLine1.trim(),
        city: address.city.trim(),
        state: address.state.trim().toUpperCase(),
        zip: address.zip.trim(),
      };
    }
    mutation.mutate(body, {
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t('app.crm.leads.converted'));
      },
    });
  };
  const req = t('common.required');
  const required = t('validation.required');
  return (
    <CrmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('app.crm.leads.convertTitle')}
      description={t('app.crm.leads.convertText')}
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        {mutation.isError ? (
          <Alert variant="danger" role="alert">
            {errorText(mutation.error)}
          </Alert>
        ) : null}
        {needsLastName ? (
          <FormField
            label={t('app.crm.leads.convertLastName')}
            hint={t('app.crm.leads.convertLastNameHint')}
            required
            requiredLabel={req}
            error={errors['lastName'] ? required : undefined}
          >
            {(c) => <Input {...c} value={lastName} onChange={(e) => setLastName(e.target.value)} />}
          </FormField>
        ) : null}
        {needsAddress ? (
          <>
            <p className="text-sm text-fg-muted">{t('app.crm.leads.convertAddressHint')}</p>
            <FormField
              label={t('app.crm.fields.address1')}
              required
              requiredLabel={req}
              error={errors['addressLine1'] ? required : undefined}
            >
              {(c) => (
                <Input
                  {...c}
                  autoComplete="address-line1"
                  value={address.addressLine1}
                  onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })}
                />
              )}
            </FormField>
            <FormField
              label={t('app.crm.fields.city')}
              required
              requiredLabel={req}
              error={errors['city'] ? required : undefined}
            >
              {(c) => (
                <Input
                  {...c}
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                />
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label={t('app.crm.fields.state')}
                required
                requiredLabel={req}
                error={errors['state'] ? t('app.crm.fields.invalidState') : undefined}
              >
                {(c) => (
                  <Input
                    {...c}
                    maxLength={2}
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                  />
                )}
              </FormField>
              <FormField
                label={t('app.crm.fields.zip')}
                required
                requiredLabel={req}
                error={errors['zip'] ? t('app.crm.fields.invalidZip') : undefined}
              >
                {(c) => (
                  <Input
                    {...c}
                    inputMode="numeric"
                    value={address.zip}
                    onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                  />
                )}
              </FormField>
            </div>
          </>
        ) : null}
        <Button type="submit" loading={mutation.isPending}>
          {t('app.crm.leads.convertButton')}
        </Button>
      </form>
    </CrmDialog>
  );
}
