import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Label,
  Select,
  Textarea,
  toast,
} from '@roofing/ui';
import { Receipt } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useEmployees, usePropertyDirectory } from '../../api/crm';
import {
  money,
  QUOTE_STATUSES,
  useApproveVersion,
  useCatalogPackages,
  useCreateQuote,
  useDeclineVersion,
  useQuote,
  useQuotePdf,
  useQuotes,
  useQuoteVersion,
  useSendVersion,
  useViewVersion,
  type QuoteStatus,
  type QuoteVersionDetail,
} from '../../api/demo';
import {
  CrmDialog,
  ListSkeleton,
  LoadError,
  Pager,
  cardLink,
  formatAddress,
  fullName,
  useErrorText,
} from '../../components/crm/ui';
import { QuoteStatusBadge, SimulationNote } from '../../components/sim/ui';
import { useRole } from '../../role';

const ALL = 'all';

export function QuotesPage() {
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const office = role === 'administrador' || role === 'superadministrador';
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const query = useQuotes({ status: status === ALL ? undefined : (status as QuoteStatus), page });
  const statuses = QUOTE_STATUSES.filter((s) => office || s !== 'DRAFT');
  const options = [
    { value: ALL, label: t('app.crm.common.all') },
    ...statuses.map((s) => ({ value: s, label: t(`app.sim.status.quote.${s}`) })),
  ];
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <section className="grid gap-5">
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
        <FormField label={t('app.crm.fields.status')}>
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
        {office && <Button onClick={() => setCreating(true)}>{t('app.sim.quotes.new')}</Button>}
      </div>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.quotes.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-7" />}
          title={status === ALL ? t('app.sim.quotes.empty') : t('app.sim.quotes.emptyFiltered')}
          description={t('app.sim.quotes.emptyText')}
        />
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            {t('app.crm.common.results', { count: query.data.total })}
          </p>
          <ul className="grid gap-3">
            {query.data.quotes.map((quote) => {
              const version = quote.latestVersion;
              const totals = version?.options.map((o) => o.totalCents) ?? [];
              const from = totals.length ? Math.min(...totals) : null;
              return (
                <li key={quote.id}>
                  <Link to={`/cotizaciones/${quote.id}`} className={cardLink}>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display text-lg font-bold">
                        {quote.number} · {fullName(quote.customer)}
                      </span>
                      {version && <QuoteStatusBadge status={version.status} />}
                    </span>
                    <span className="mt-1 block text-fg-muted">
                      {formatAddress(quote.property)}
                    </span>
                    <span className="mt-1 flex flex-wrap justify-between gap-2 text-sm text-fg-muted">
                      <span>{date.format(new Date(quote.createdAt))}</span>
                      {from !== null && (
                        <span>
                          {totals.length > 1 ? '≥ ' : ''}
                          {money(from, i18n.language)}
                        </span>
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
      {creating && (
        <CreateQuoteDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => void navigate(`/cotizaciones/${id}`)}
        />
      )}
    </section>
  );
}

function CreateQuoteDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const errorText = useErrorText();
  const properties = usePropertyDirectory();
  const packages = useCatalogPackages();
  const employees = useEmployees();
  const create = useCreateQuote();
  const [propertyId, setPropertyId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [area, setArea] = useState('2000');
  const [pitch, setPitch] = useState('6');
  const [ridge, setRidge] = useState('40');
  const [eaves, setEaves] = useState('130');
  const [rep, setRep] = useState('none');
  const [locale, setLocale] = useState<'es' | 'en'>(i18n.language.startsWith('en') ? 'en' : 'es');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const numbers = [area, pitch, ridge, eaves].map(Number);
    if (!propertyId || picked.length === 0 || numbers.some((n) => !Number.isFinite(n) || n < 0)) {
      setError(
        picked.length === 0 ? t('app.sim.quotes.pickPackages') : t('app.crm.common.formErrors'),
      );
      return;
    }
    const [areaSqFt, pitchRise, ridgeFt, eavesFt] = numbers as [number, number, number, number];
    create.mutate(
      {
        propertyId,
        packageIds: picked,
        measurements: {
          sections: [{ name: 'Techo principal', areaSqFt, areaKind: 'PLAN', pitchRise }],
          ridgeFt,
          eavesFt,
          hipsFt: 0,
          valleysFt: 0,
          guttersFt: 0,
        },
        ...(rep !== 'none' ? { salesRepId: rep } : {}),
        locale,
      },
      {
        onSuccess: (quote) => {
          toast.success(t('app.sim.quotes.created'));
          onCreated(quote.id);
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  };

  const number = (label: string, value: string, set: (v: string) => void) => (
    <FormField label={label}>
      {(c) => (
        <Input {...c} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
      )}
    </FormField>
  );

  return (
    <CrmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('app.sim.quotes.createTitle')}
      description={t('app.sim.quotes.createHint')}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FormField label={t('app.sim.quotes.property')} required>
          {(c) => (
            <Select
              {...c}
              value={propertyId}
              onValueChange={setPropertyId}
              options={(properties.data ?? []).map((p) => ({
                value: p.id,
                label: formatAddress(p),
              }))}
            />
          )}
        </FormField>
        <fieldset className="grid gap-2">
          <legend className="font-semibold">{t('app.sim.quotes.packages')}</legend>
          {(packages.data ?? [])
            .filter((p) => p.isActive)
            .map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Checkbox
                  id={`pkg-${p.id}`}
                  checked={picked.includes(p.id)}
                  onCheckedChange={(v) =>
                    setPicked((list) =>
                      v === true ? [...list, p.id] : list.filter((x) => x !== p.id),
                    )
                  }
                />
                <Label htmlFor={`pkg-${p.id}`}>{p.name}</Label>
              </div>
            ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          {number(t('app.sim.quotes.area'), area, setArea)}
          {number(t('app.sim.quotes.pitch'), pitch, setPitch)}
          {number(t('app.sim.quotes.ridge'), ridge, setRidge)}
          {number(t('app.sim.quotes.eaves'), eaves, setEaves)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('app.sim.quotes.salesRep')}>
            {(c) => (
              <Select
                {...c}
                value={rep}
                onValueChange={setRep}
                options={[
                  { value: 'none', label: t('app.crm.common.unassigned') },
                  ...(employees.data ?? []).map((e) => ({ value: e.id, label: e.user.name })),
                ]}
              />
            )}
          </FormField>
          <FormField label={t('app.sim.quotes.locale')}>
            {(c) => (
              <Select
                {...c}
                value={locale}
                onValueChange={(v) => setLocale(v as 'es' | 'en')}
                options={[
                  { value: 'es', label: t('common.spanish') },
                  { value: 'en', label: t('common.english') },
                ]}
              />
            )}
          </FormField>
        </div>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={create.isPending}>
            {create.isPending ? t('app.crm.common.creating') : t('app.crm.common.create')}
          </Button>
        </div>
      </form>
    </CrmDialog>
  );
}

export function QuoteDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { role } = useRole();
  const office = role === 'administrador' || role === 'superadministrador';
  const query = useQuote(id);
  const [picked, setPicked] = useState<string | null>(null);
  const versionId = picked ?? query.data?.versions[0]?.id;
  const version = useQuoteVersion(id, versionId);

  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) {
    return (
      <LoadError error={query.error} onRetry={() => void query.refetch()} backTo="/cotizaciones" />
    );
  }
  const quote = query.data;
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">{quote.number}</h2>
          <p className="text-fg-muted">
            {t('app.sim.quotes.for', { name: fullName(quote.customer) })} ·{' '}
            {formatAddress(quote.property)}
          </p>
        </div>
        {version.data && <QuoteStatusBadge status={version.data.status} />}
      </div>

      {quote.versions.length > 1 && (
        <div
          role="group"
          aria-label={t('app.sim.quotes.versions')}
          className="flex flex-wrap gap-2"
        >
          {quote.versions.map((v) => (
            <Button
              key={v.id}
              size="sm"
              variant={v.id === versionId ? 'primary' : 'secondary'}
              aria-pressed={v.id === versionId}
              onClick={() => setPicked(v.id)}
            >
              {t('app.sim.quotes.version', { n: v.versionNumber })} ·{' '}
              {t(`app.sim.status.quote.${v.status}`)}
            </Button>
          ))}
        </div>
      )}

      {version.isPending ? (
        <ListSkeleton rows={2} />
      ) : version.isError ? (
        <LoadError error={version.error} onRetry={() => void version.refetch()} />
      ) : (
        <VersionView
          quoteId={id}
          version={version.data}
          office={office}
          customer={role === 'cliente'}
          date={date}
        />
      )}
    </div>
  );
}

function VersionView({
  quoteId,
  version,
  office,
  customer,
  date,
}: {
  quoteId: string;
  version: QuoteVersionDetail;
  office: boolean;
  customer: boolean;
  date: Intl.DateTimeFormat;
}) {
  const { t, i18n } = useTranslation();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const send = useSendVersion(quoteId, version.id);
  const view = useViewVersion(quoteId, version.id);
  const approve = useApproveVersion(quoteId, version.id);
  const decline = useDeclineVersion(quoteId, version.id);
  const pdf = useQuotePdf();
  const [accepting, setAccepting] = useState<QuoteVersionDetail['options'][number] | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const marked = useRef<string | null>(null);

  // Al abrirlo, el cliente marca como «visto» el presupuesto enviado.
  useEffect(() => {
    if (customer && version.status === 'SENT' && marked.current !== version.id) {
      marked.current = version.id;
      view.mutate({});
    }
  }, [customer, version.id, version.status, view]);

  const canRespond = customer && (version.status === 'SENT' || version.status === 'VIEWED');
  const hasPdf = version.status !== 'DRAFT';
  const openPdf = () =>
    pdf.mutate(
      { id: quoteId, versionId: version.id },
      {
        onSuccess: (url) => window.open(url, '_blank', 'noopener'),
        onError: () => toast.error(t('app.sim.quotes.pdfError')),
      },
    );

  return (
    <div className="grid gap-5">
      <Card>
        <CardContent className="grid gap-2 p-5 text-sm text-fg-muted">
          <p>
            {t('app.sim.quotes.params', {
              waste: version.wasteBps / 100,
              tax: version.taxBps / 100,
              deposit: version.depositBps / 100,
            })}
          </p>
          {version.sentAt && (
            <p>{t('app.sim.quotes.sentOn', { date: date.format(new Date(version.sentAt)) })}</p>
          )}
          {version.validUntil && (
            <p>
              {t('app.sim.quotes.validUntil', { date: date.format(new Date(version.validUntil)) })}
            </p>
          )}
          {version.status === 'APPROVED' && version.approvedAt && (
            <p className="font-semibold text-success">
              {t('app.sim.quotes.approvedNote', {
                date: date.format(new Date(version.approvedAt)),
              })}
            </p>
          )}
          {version.status === 'DECLINED' && version.declineReason && (
            <p>{t('app.sim.quotes.declineReason', { reason: version.declineReason })}</p>
          )}
          {version.notes && <p>{version.notes}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {office && version.status === 'DRAFT' && (
          <div className="grid gap-2">
            <Button
              loading={send.isPending}
              onClick={() =>
                send.mutate(
                  {},
                  {
                    onSuccess: () => toast.success(t('app.sim.quotes.sent')),
                    onError: (e) => toast.error(errorText(e)),
                  },
                )
              }
            >
              {send.isPending ? t('app.sim.quotes.sending') : t('app.sim.quotes.send')}
            </Button>
            <p className="text-sm text-fg-muted">{t('app.sim.quotes.sendHint')}</p>
          </div>
        )}
        {hasPdf && (
          <Button variant="secondary" loading={pdf.isPending} onClick={openPdf}>
            {t('app.sim.quotes.pdf')}
          </Button>
        )}
        {canRespond && (
          <Button variant="secondary" onClick={() => setDeclining(true)}>
            {t('app.sim.quotes.decline')}
          </Button>
        )}
      </div>

      <h3 className="font-display text-xl font-bold">{t('app.sim.quotes.options')}</h3>
      <ul className="grid gap-4 lg:grid-cols-2">
        {version.options.map((option) => {
          const chosen = version.approvedOptionId === option.id;
          return (
            <li key={option.id}>
              <Card className={chosen ? 'border-success' : undefined}>
                <CardContent className="grid gap-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-lg font-bold">{option.title}</span>
                    <Badge variant="primary">{t(`app.sim.tier.${option.tier}`)}</Badge>
                  </div>
                  <p className="font-display text-3xl font-extrabold">
                    {money(option.totalCents, i18n.language)}
                  </p>
                  <p className="text-sm text-fg-muted">
                    {t('app.sim.quotes.deposit')}: {money(option.depositCents, i18n.language)} ·{' '}
                    {t('app.sim.quotes.balance')}: {money(option.balanceCents, i18n.language)}
                  </p>
                  <p className="text-sm">{option.warrantyText}</p>
                  <details>
                    <summary className="cursor-pointer font-semibold">
                      {t('app.sim.quotes.lines')}
                    </summary>
                    <ul className="mt-2 grid gap-1 text-sm">
                      {option.lines.map((line) => (
                        <li key={line.id} className="flex justify-between gap-3">
                          <span>
                            {line.name}
                            {line.colorName ? ` · ${line.colorName}` : ''}
                          </span>
                          <span>{money(line.lineTotalCents, i18n.language)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                  {canRespond && (
                    <Button onClick={() => setAccepting(option)}>
                      {t('app.sim.quotes.accept')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {accepting && (
        <CrmDialog
          open
          onOpenChange={(open) => !open && setAccepting(null)}
          title={t('app.sim.quotes.acceptTitle')}
          description={t('app.sim.quotes.acceptText', {
            title: accepting.title,
            total: money(accepting.totalCents, i18n.language),
          })}
        >
          <SimulationNote text={t('app.sim.quotes.notSigned')} />
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setAccepting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={approve.isPending}
              onClick={() =>
                approve.mutate(
                  { optionId: accepting.id },
                  {
                    onSuccess: (r) => {
                      toast.success(t('app.sim.quotes.accepted'));
                      void navigate(r.project ? `/proyectos/${r.project.id}` : '/proyectos');
                    },
                    onError: (e) => {
                      setAccepting(null);
                      toast.error(errorText(e));
                    },
                  },
                )
              }
            >
              {approve.isPending
                ? t('app.sim.quotes.accepting')
                : t('app.sim.quotes.acceptConfirm')}
            </Button>
          </div>
        </CrmDialog>
      )}

      {declining && (
        <CrmDialog
          open
          onOpenChange={(open) => !open && setDeclining(false)}
          title={t('app.sim.quotes.declineTitle')}
        >
          <div className="grid gap-4">
            <FormField label={t('app.sim.quotes.reason')}>
              {(c) => (
                <Textarea {...c} value={reason} onChange={(e) => setReason(e.target.value)} />
              )}
            </FormField>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeclining(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                loading={decline.isPending}
                onClick={() =>
                  decline.mutate(reason.trim() ? { reason: reason.trim() } : {}, {
                    onSuccess: () => {
                      toast.success(t('app.sim.quotes.declined'));
                      setDeclining(false);
                    },
                    onError: (e) => toast.error(errorText(e)),
                  })
                }
              >
                {t('app.sim.quotes.decline')}
              </Button>
            </div>
          </div>
        </CrmDialog>
      )}
    </div>
  );
}
