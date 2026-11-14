import {
  Alert,
  Button,
  Card,
  CardContent,
  EmptyState,
  FormField,
  Input,
  Select,
  Textarea,
  toast,
} from '@roofing/ui';
import { ClipboardCheck, ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCompleteInspection,
  useDeleteSection,
  useInspection,
  useInspections,
  usePhotoUrl,
  usePropertyDirectory,
  useSaveSection,
  useUpdateInspection,
  type SectionInput,
} from '../../api/crm';
import {
  ROOF_TYPES,
  type InspectionDetail,
  type InspectionSection,
  type RoofType,
} from '../../api/types';
import {
  CrmDialog,
  Info,
  ListSkeleton,
  LoadError,
  Pager,
  cardLink,
  formatAddress,
  useErrorText,
} from '../../components/crm/ui';
import { uploadInspectionPhoto, validatePhoto, type UploadStage } from '../../crm/upload';

const ALL = 'all';
const NONE = 'none';

/** Número escrito con coma o punto; `null` si no es válido, `undefined` si está vacío. */
export function parseNumber(text: string): number | null | undefined {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return undefined;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

export function InspectionsPage() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const query = useInspections({
    status: status === ALL ? undefined : (status as 'DRAFT' | 'COMPLETED'),
    page,
  });
  const properties = usePropertyDirectory();
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const options = [
    { value: ALL, label: t('app.crm.common.all') },
    { value: 'DRAFT', label: t('app.crm.inspections.statusDRAFT') },
    { value: 'COMPLETED', label: t('app.crm.inspections.statusCOMPLETED') },
  ];
  return (
    <section className="grid gap-5">
      <div className="max-w-xs">
        <FormField label={t('app.crm.inspections.statusFilter')}>
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
      </div>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.inspections.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="size-7" />}
          title={
            status === ALL ? t('app.crm.inspections.empty') : t('app.crm.inspections.emptyFiltered')
          }
          description={status === ALL ? t('app.crm.inspections.emptyText') : undefined}
        />
      ) : (
        <>
          <ul className="grid gap-3">
            {query.data.inspections.map((i) => {
              const p = properties.data?.find((x) => x.id === i.propertyId);
              return (
                <li key={i.id}>
                  <Link to={`/inspecciones/${i.id}`} className={cardLink}>
                    <span className="font-display text-lg font-bold">
                      {t('app.crm.inspections.title', { date: date.format(new Date(i.createdAt)) })}
                    </span>
                    <span className="mt-1 block text-fg-muted">{p ? formatAddress(p) : ''}</span>
                    <span className="mt-1 block text-sm">
                      {t(`app.crm.inspections.status${i.status}`)}
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

export function InspectionDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const query = useInspection(id);
  const properties = usePropertyDirectory();
  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) {
    return (
      <LoadError error={query.error} onRetry={() => void query.refetch()} backTo="/inspecciones" />
    );
  }
  const inspection = query.data;
  const locked = inspection.status === 'COMPLETED';
  const property = properties.data?.find((p) => p.id === inspection.propertyId);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' });
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-display text-2xl font-bold">
          {t('app.crm.inspections.title', { date: date.format(new Date(inspection.createdAt)) })}
        </h2>
        {property ? (
          <p className="text-fg-muted">
            <Link className="underline" to={`/propiedades/${property.id}`}>
              {formatAddress(property)}
            </Link>
          </p>
        ) : null}
      </div>
      {locked ? (
        <Alert variant="success">
          {t('app.crm.inspections.completedBanner', {
            date: date.format(new Date(inspection.completedAt ?? inspection.updatedAt)),
          })}
        </Alert>
      ) : null}
      <GeneralCard inspection={inspection} locked={locked} />
      <SectionsCard inspection={inspection} locked={locked} />
      <PhotosCard inspection={inspection} locked={locked} />
      {!locked ? <CompleteCard inspection={inspection} /> : null}
    </div>
  );
}

function GeneralCard({ inspection, locked }: { inspection: InspectionDetail; locked: boolean }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const mutation = useUpdateInspection(inspection.id);
  const [roofType, setRoofType] = useState<string>(inspection.roofType ?? NONE);
  const [age, setAge] = useState(inspection.roofAgeYears?.toString() ?? '');
  const [findings, setFindings] = useState(inspection.findings ?? '');
  const [ageError, setAgeError] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const years = parseNumber(age);
    if (
      years === null ||
      (years !== undefined && (!Number.isInteger(years) || years < 0 || years > 150))
    ) {
      return setAgeError(true);
    }
    setAgeError(false);
    mutation.mutate(
      {
        roofType: roofType === NONE ? null : (roofType as RoofType),
        roofAgeYears: years ?? null,
        findings: findings.trim() || null,
      },
      { onSuccess: () => toast.success(t('app.crm.inspections.general')) },
    );
  };

  if (locked) {
    return (
      <Card>
        <CardContent className="grid gap-3 p-6">
          <h3 className="font-display text-lg font-bold">
            {t('app.crm.inspections.generalTitle')}
          </h3>
          <dl className="grid gap-3">
            <Info label={t('app.crm.inspections.roofType')}>
              {inspection.roofType
                ? t(`app.crm.roofType.${inspection.roofType}`)
                : t('app.crm.common.noData')}
            </Info>
            <Info label={t('app.crm.inspections.roofAge')}>
              {inspection.roofAgeYears ?? t('app.crm.common.noData')}
            </Info>
            <Info label={t('app.crm.inspections.findings')}>
              {inspection.findings ?? t('app.crm.common.noData')}
            </Info>
          </dl>
        </CardContent>
      </Card>
    );
  }
  const options = [
    { value: NONE, label: t('app.crm.common.noData') },
    ...ROOF_TYPES.map((r) => ({ value: r, label: t(`app.crm.roofType.${r}`) })),
  ];
  return (
    <Card>
      <CardContent className="p-6">
        <form noValidate onSubmit={submit} className="grid gap-4">
          <h3 className="font-display text-lg font-bold">
            {t('app.crm.inspections.generalTitle')}
          </h3>
          {mutation.isError ? (
            <Alert variant="danger" role="alert">
              {errorText(mutation.error)}
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('app.crm.inspections.roofType')}>
              {(c) => (
                <Select {...c} options={options} value={roofType} onValueChange={setRoofType} />
              )}
            </FormField>
            <FormField
              label={t('app.crm.inspections.roofAge')}
              error={ageError ? t('app.crm.inspections.invalidNumber') : undefined}
            >
              {(c) => (
                <Input
                  {...c}
                  inputMode="numeric"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
              )}
            </FormField>
          </div>
          <FormField label={t('app.crm.inspections.findings')}>
            {(c) => (
              <Textarea
                {...c}
                rows={4}
                value={findings}
                onChange={(e) => setFindings(e.target.value)}
              />
            )}
          </FormField>
          <Button type="submit" loading={mutation.isPending} className="justify-self-start">
            {t('app.crm.inspections.saveGeneral')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const EMPTY_SECTION = {
  name: '',
  area: '',
  pitch: '',
  ridge: '',
  eave: '',
  hip: '',
  valley: '',
  gutter: '',
  notes: '',
};
type SectionForm = typeof EMPTY_SECTION;
const lengthFields = ['ridge', 'eave', 'hip', 'valley', 'gutter'] as const;

function SectionsCard({ inspection, locked }: { inspection: InspectionDetail; locked: boolean }) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<InspectionSection | 'new' | null>(null);
  const [deleting, setDeleting] = useState<InspectionSection | null>(null);
  const del = useDeleteSection(inspection.id);
  const errorText = useErrorText();
  const num = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  return (
    <Card>
      <CardContent className="grid gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold">
              {t('app.crm.inspections.sectionsTitle')}
            </h3>
            <p className="text-fg-muted">{t('app.crm.inspections.sectionsText')}</p>
          </div>
          {!locked ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              {t('app.crm.inspections.addSection')}
            </Button>
          ) : null}
        </div>
        {inspection.sections.length === 0 ? (
          <EmptyState
            title={t('app.crm.inspections.noSections')}
            description={t('app.crm.inspections.noSectionsText')}
          />
        ) : (
          <ul className="grid gap-3">
            {inspection.sections.map((s) => (
              <li key={s.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display font-bold">{s.name}</p>
                  {!locked ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>
                        {t('app.crm.common.edit')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(s)}>
                        {t('app.crm.inspections.deleteSection')}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-1 text-fg-muted">
                  {t('app.crm.inspections.areaValue', { value: num.format(s.areaSqft) })} ·{' '}
                  {t('app.crm.inspections.pitchValue', { value: num.format(s.pitchRise) })}
                </p>
                <p className="mt-1 text-sm text-fg-muted">
                  {lengthFields
                    .map((f) => [f, s[`${f}Ft`]] as const)
                    .filter(([, v]) => v !== null && v > 0)
                    .map(([f, v]) => `${t(`app.crm.inspections.${f}`)}: ${num.format(v ?? 0)}`)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing ? (
        <SectionDialog
          key={editing === 'new' ? 'new' : editing.id}
          inspectionId={inspection.id}
          section={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <CrmDialog
          open
          onOpenChange={(open) => !open && (setDeleting(null), del.reset())}
          title={t('app.crm.inspections.deleteSectionTitle', { name: deleting.name })}
          description={t('app.crm.inspections.deleteSectionText')}
        >
          {del.isError ? (
            <Alert variant="danger" role="alert" className="mb-4">
              {errorText(del.error)}
            </Alert>
          ) : null}
          <Button
            variant="destructive"
            loading={del.isPending}
            onClick={() =>
              del.mutate(deleting.id, {
                onSuccess: () => {
                  setDeleting(null);
                  toast.success(t('app.crm.inspections.sectionDeleted'));
                },
              })
            }
          >
            {t('app.crm.inspections.deleteSection')}
          </Button>
        </CrmDialog>
      ) : null}
    </Card>
  );
}

function SectionDialog({
  inspectionId,
  section,
  onClose,
}: {
  inspectionId: string;
  section: InspectionSection | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const mutation = useSaveSection(inspectionId);
  const [form, setForm] = useState<SectionForm>(
    section
      ? {
          name: section.name,
          area: String(section.areaSqft),
          pitch: String(section.pitchRise),
          ridge: section.ridgeFt?.toString() ?? '',
          eave: section.eaveFt?.toString() ?? '',
          hip: section.hipFt?.toString() ?? '',
          valley: section.valleyFt?.toString() ?? '',
          gutter: section.gutterFt?.toString() ?? '',
          notes: section.notes ?? '',
        }
      : EMPTY_SECTION,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof SectionForm) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next['name'] = t('validation.required');
    const area = parseNumber(form.area);
    if (area === undefined || area === null || area <= 0)
      next['area'] = t('app.crm.inspections.invalidArea');
    const pitch = parseNumber(form.pitch);
    if (
      pitch === undefined ||
      pitch === null ||
      pitch < 0 ||
      pitch > 24 ||
      Math.abs(pitch * 10 - Math.round(pitch * 10)) > 1e-9
    ) {
      next['pitch'] = t('app.crm.inspections.invalidPitch');
    }
    const lengths: Partial<Record<(typeof lengthFields)[number], number>> = {};
    for (const f of lengthFields) {
      const v = parseNumber(form[f]);
      if (v === null || (v !== undefined && v < 0))
        next[f] = t('app.crm.inspections.invalidLength');
      else if (v !== undefined) lengths[f] = v;
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || area == null || pitch == null) return;
    const body: SectionInput & { sectionId?: string } = {
      name: form.name.trim(),
      areaSqft: area,
      pitchRise: pitch,
      ridgeFt: lengths.ridge ?? 0,
      eaveFt: lengths.eave ?? 0,
      hipFt: lengths.hip ?? 0,
      valleyFt: lengths.valley ?? 0,
      gutterFt: lengths.gutter ?? 0,
      notes: form.notes.trim() || null,
    };
    if (section) body.sectionId = section.id;
    mutation.mutate(body, {
      onSuccess: () => {
        toast.success(t('app.crm.inspections.sectionSaved'));
        onClose();
      },
    });
  };

  const req = t('common.required');
  return (
    <CrmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={section ? t('app.crm.inspections.editSection') : t('app.crm.inspections.addSection')}
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        {mutation.isError ? (
          <Alert variant="danger" role="alert">
            {errorText(mutation.error)}
          </Alert>
        ) : null}
        <FormField
          label={t('app.crm.inspections.sectionName')}
          hint={t('app.crm.inspections.sectionNameHint')}
          required
          requiredLabel={req}
          error={errors['name']}
        >
          {(c) => <Input {...c} value={form.name} onChange={set('name')} />}
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label={t('app.crm.inspections.area')}
            required
            requiredLabel={req}
            error={errors['area']}
          >
            {(c) => <Input {...c} inputMode="decimal" value={form.area} onChange={set('area')} />}
          </FormField>
          <FormField
            label={t('app.crm.inspections.pitch')}
            required
            requiredLabel={req}
            error={errors['pitch']}
          >
            {(c) => <Input {...c} inputMode="decimal" value={form.pitch} onChange={set('pitch')} />}
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {lengthFields.map((f) => (
            <FormField key={f} label={t(`app.crm.inspections.${f}`)} error={errors[f]}>
              {(c) => <Input {...c} inputMode="decimal" value={form[f]} onChange={set(f)} />}
            </FormField>
          ))}
        </div>
        <FormField label={`${t('app.crm.fields.notes')} (${t('app.crm.common.optional')})`}>
          {(c) => <Textarea {...c} rows={2} value={form.notes} onChange={set('notes')} />}
        </FormField>
        <Button type="submit" loading={mutation.isPending}>
          {t('app.crm.common.save')}
        </Button>
      </form>
    </CrmDialog>
  );
}

interface UploadItem {
  key: string;
  file: File;
  /** Sección elegida al subir: el reintento la conserva. */
  sectionId: string;
  preview: string;
  stage: UploadStage | 'error';
  progress: number;
  errorText: string | null;
}

function PhotosCard({ inspection, locked }: { inspection: InspectionDetail; locked: boolean }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [sectionId, setSectionId] = useState(NONE);
  const [items, setItems] = useState<UploadItem[]>([]);

  // Libera las vistas previas al salir.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    const list = previews.current;
    return () => list.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const patch = (key: string, change: Partial<UploadItem>) =>
    setItems((all) => all.map((i) => (i.key === key ? { ...i, ...change } : i)));

  const start = async (item: UploadItem, section: string) => {
    patch(item.key, { stage: 'preparing', progress: 0, errorText: null });
    try {
      await uploadInspectionPhoto(inspection.id, item.file, {
        sectionId: section === NONE ? undefined : section,
        onStage: (stage) => patch(item.key, { stage }),
        onProgress: (fraction) => patch(item.key, { progress: fraction }),
      });
      setItems((all) => all.filter((i) => i.key !== item.key));
      URL.revokeObjectURL(item.preview);
      await client.invalidateQueries({ queryKey: ['inspections', 'detail', inspection.id] });
    } catch (error) {
      const message =
        error instanceof Error && error.message === 'UPLOAD_FAILED'
          ? t('app.crm.errors.uploadFailed')
          : errorText(error);
      patch(item.key, { stage: 'error', errorText: message });
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      const invalid = validatePhoto(file);
      const item: UploadItem = {
        key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        sectionId,
        preview,
        stage: invalid ? 'error' : 'preparing',
        progress: 0,
        errorText: invalid ? t(`app.crm.errors.${invalid}`) : null,
      };
      setItems((all) => [...all, item]);
      if (!invalid) void start(item, sectionId);
    }
    if (input.current) input.current.value = '';
  };

  const sectionOptions = [
    { value: NONE, label: t('app.crm.inspections.noSection') },
    ...inspection.sections.map((s) => ({ value: s.id, label: s.name })),
  ];
  return (
    <Card>
      <CardContent className="grid gap-4 p-6">
        <div>
          <h3 className="font-display text-lg font-bold">{t('app.crm.inspections.photosTitle')}</h3>
          <p className="text-fg-muted">{t('app.crm.inspections.photosText')}</p>
        </div>
        {!locked ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <FormField label={t('app.crm.inspections.photoSection')}>
                {(c) => (
                  <Select
                    {...c}
                    options={sectionOptions}
                    value={sectionId}
                    onValueChange={setSectionId}
                  />
                )}
              </FormField>
            </div>
            <input
              ref={input}
              id="photo-input"
              aria-label={t('app.crm.inspections.addPhotos')}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="sr-only"
              onChange={(e) => onFiles(e.target.files)}
            />
            <Button onClick={() => input.current?.click()}>
              <ImagePlus aria-hidden="true" className="size-5" />
              {t('app.crm.inspections.addPhotos')}
            </Button>
          </div>
        ) : null}

        {items.length > 0 ? (
          <ul className="grid gap-3" aria-label={t('app.crm.inspections.photosTitle')}>
            {items.map((item) => (
              <li
                key={item.key}
                className="flex items-center gap-3 rounded-md border border-border p-2"
              >
                <img
                  src={item.preview}
                  alt={t('app.crm.inspections.previewAlt', { name: item.file.name })}
                  className="size-16 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.file.name}</p>
                  {item.stage === 'error' ? (
                    <p role="alert" className="text-sm font-medium text-danger">
                      {item.errorText}
                    </p>
                  ) : (
                    <>
                      <progress
                        className="h-2 w-full"
                        max={1}
                        value={item.stage === 'finishing' ? 1 : item.progress}
                        aria-label={item.file.name}
                      />
                      <p className="text-sm text-fg-muted" aria-live="polite">
                        {item.stage === 'uploading'
                          ? t('app.crm.inspections.uploading', {
                              percent: Math.round(item.progress * 100),
                            })
                          : item.stage === 'finishing'
                            ? t('app.crm.inspections.finishing')
                            : t('app.crm.inspections.preparing')}
                      </p>
                    </>
                  )}
                </div>
                {item.stage === 'error' ? (
                  <div className="flex gap-2">
                    {validatePhoto(item.file) === null ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void start(item, sectionId)}
                      >
                        {t('app.crm.inspections.retryUpload')}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setItems((all) => all.filter((i) => i.key !== item.key))}
                    >
                      {t('app.crm.inspections.removeUpload')}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {inspection.photos.length === 0 && items.length === 0 ? (
          <EmptyState
            title={t('app.crm.inspections.noPhotos')}
            description={t('app.crm.inspections.noPhotosText')}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {inspection.photos.map((photo, index) => (
              <li key={photo.id}>
                <PhotoThumb
                  fileId={photo.fileId}
                  alt={
                    photo.caption
                      ? t('app.crm.inspections.photoAltCaption', { caption: photo.caption })
                      : t('app.crm.inspections.photoAlt', { index: index + 1 })
                  }
                />
                {photo.sectionId ? (
                  <p className="mt-1 text-sm text-fg-muted">
                    {inspection.sections.find((s) => s.id === photo.sectionId)?.name}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PhotoThumb({ fileId, alt }: { fileId: string; alt: string }) {
  const { t } = useTranslation();
  const query = usePhotoUrl(fileId);
  if (query.isPending) {
    return (
      <div
        role="status"
        aria-label={t('common.loading')}
        className="aspect-square animate-pulse rounded-md bg-surface-alt"
      />
    );
  }
  if (query.isError) {
    return (
      <div className="grid aspect-square place-items-center rounded-md border border-danger bg-danger-soft p-2 text-center text-sm">
        {t('app.crm.inspections.photoLoadError')}
      </div>
    );
  }
  return (
    <img
      src={query.data.url}
      alt={alt}
      loading="lazy"
      className="aspect-square w-full rounded-md object-cover"
    />
  );
}

function CompleteCard({ inspection }: { inspection: InspectionDetail }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const mutation = useCompleteInspection(inspection.id);
  const [open, setOpen] = useState(false);
  const blocked = inspection.sections.length === 0;
  return (
    <Card>
      <CardContent className="grid gap-3 p-6">
        <h3 className="font-display text-lg font-bold">{t('app.crm.inspections.completeTitle')}</h3>
        <p className="text-fg-muted">{t('app.crm.inspections.completeText')}</p>
        {blocked ? <p className="text-sm">{t('app.crm.inspections.needSection')}</p> : null}
        <Button disabled={blocked} onClick={() => setOpen(true)} className="justify-self-start">
          {t('app.crm.inspections.completeButton')}
        </Button>
      </CardContent>
      <CrmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) mutation.reset();
        }}
        title={t('app.crm.inspections.completeTitle')}
        description={t('app.crm.inspections.completeText')}
      >
        {mutation.isError ? (
          <Alert variant="danger" role="alert" className="mb-4">
            {errorText(mutation.error)}
          </Alert>
        ) : null}
        <Button
          loading={mutation.isPending}
          onClick={() =>
            mutation.mutate(undefined, {
              onSuccess: () => {
                setOpen(false);
                toast.success(t('app.crm.inspections.completed'));
              },
            })
          }
        >
          {t('app.crm.inspections.completeConfirm')}
        </Button>
      </CrmDialog>
    </Card>
  );
}
