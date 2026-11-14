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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@roofing/ui';
import { Package } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CATALOG_UNITS,
  money,
  useCatalogCategories,
  useCatalogItems,
  useCatalogPackages,
  useCreateCatalogItem,
  useUpdateCatalogItem,
  useUpdatePackage,
  type CatalogItem,
  type CatalogKind,
  type CatalogPackage,
  type CatalogUnit,
} from '../../api/demo';
import { CrmDialog, ListSkeleton, LoadError, Pager, useErrorText } from '../../components/crm/ui';
import { SimulationNote, dollarsToCents } from '../../components/sim/ui';

const ALL = 'all';
const centsToText = (cents: number) => (cents / 100).toFixed(2);

export function CatalogPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-5">
      <SimulationNote text={t('app.sim.catalog.hint')} />
      <Tabs defaultValue="items">
        <TabsList aria-label={t('app.sim.catalog.tabsLabel')}>
          <TabsTrigger value="items">{t('app.sim.catalog.items')}</TabsTrigger>
          <TabsTrigger value="packages">{t('app.sim.catalog.packages')}</TabsTrigger>
        </TabsList>
        <TabsContent value="items">
          <ItemsTab />
        </TabsContent>
        <TabsContent value="packages">
          <PackagesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ItemsTab() {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const query = useCatalogItems({
    kind: kind === ALL ? undefined : (kind as CatalogKind),
    ...(search.trim() ? { q: search.trim() } : {}),
    page,
  });
  const kindOptions = [
    { value: ALL, label: t('app.crm.common.all') },
    { value: 'MATERIAL', label: t('app.sim.kind.MATERIAL') },
    { value: 'LABOR', label: t('app.sim.kind.LABOR') },
  ];

  return (
    <section className="mt-4 grid gap-5">
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <FormField label={t('app.sim.catalog.search')}>
          {(c) => (
            <Input
              {...c}
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          )}
        </FormField>
        <FormField label={t('app.sim.catalog.kind')}>
          {(c) => (
            <Select
              {...c}
              options={kindOptions}
              value={kind}
              onValueChange={(v) => {
                setKind(v);
                setPage(1);
              }}
            />
          )}
        </FormField>
        <Button onClick={() => setEditing('new')}>{t('app.sim.catalog.newItem')}</Button>
      </div>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={<Package className="size-7" />} title={t('app.sim.catalog.empty')} />
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            {t('app.crm.common.results', { count: query.data.total })}
          </p>
          <ul className="grid gap-3">
            {query.data.items.map((item) => (
              <li key={item.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="grid gap-0.5">
                      <span className="font-display text-lg font-bold">{item.name}</span>
                      <span className="text-sm text-fg-muted">
                        {[item.sku, item.category.name, t(`app.sim.kind.${item.kind}`)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="text-sm">
                        {item.kind === 'MATERIAL'
                          ? t('app.sim.catalog.material', {
                              price: money(item.materialPriceCents, i18n.language),
                            })
                          : t('app.sim.catalog.labor', {
                              price: money(item.laborPriceCents, i18n.language),
                            })}{' '}
                        {t('app.sim.catalog.perUnit', { unit: t(`app.sim.unit.${item.unit}`) })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {!item.isActive && (
                        <Badge variant="neutral">{t('app.sim.catalog.inactive')}</Badge>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => setEditing(item)}>
                        {t('app.crm.common.edit')}
                      </Button>
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
      {editing && (
        <ItemDialog item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function ItemDialog({ item, onClose }: { item: CatalogItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const categories = useCatalogCategories();
  const create = useCreateCatalogItem();
  const update = useUpdateCatalogItem(item?.id ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [kind, setKind] = useState<CatalogKind>(item?.kind ?? 'MATERIAL');
  const [categoryId, setCategoryId] = useState(item?.category.id ?? '');
  const [unit, setUnit] = useState<CatalogUnit>(item?.unit ?? 'SQUARE');
  const [material, setMaterial] = useState(centsToText(item?.materialPriceCents ?? 0));
  const [labor, setLabor] = useState(centsToText(item?.laborPriceCents ?? 0));
  const [active, setActive] = useState(item?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  const kindCategories = (categories.data ?? []).filter((c) => c.kind === kind && c.isActive);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const materialCents = kind === 'LABOR' ? 0 : dollarsToCents(material);
    const laborCents = dollarsToCents(labor);
    if (!name.trim() || !categoryId || materialCents === null || laborCents === null) {
      setError(t('app.sim.catalog.invalidPrice'));
      return;
    }
    const done = {
      onSuccess: () => {
        toast.success(t('app.sim.catalog.saved'));
        onClose();
      },
      onError: (e: unknown) => setError(errorText(e)),
    };
    if (item) {
      update.mutate(
        {
          name: name.trim(),
          categoryId,
          unit,
          materialPriceCents: materialCents,
          laborPriceCents: laborCents,
          isActive: active,
        },
        done,
      );
    } else {
      create.mutate(
        {
          name: name.trim(),
          ...(sku.trim() ? { sku: sku.trim() } : {}),
          categoryId,
          kind,
          unit,
          materialPriceCents: materialCents,
          laborPriceCents: laborCents,
        },
        done,
      );
    }
  };

  const select = (
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onChange: (v: string) => void,
    disabled = false,
  ) => (
    <FormField label={label}>
      {(c) => (
        <Select
          {...c}
          options={options}
          value={value}
          onValueChange={onChange}
          disabled={disabled}
        />
      )}
    </FormField>
  );

  return (
    <CrmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={item ? t('app.sim.catalog.editItem') : t('app.sim.catalog.newItem')}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FormField label={t('app.sim.catalog.name')} required>
          {(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        {!item && (
          <FormField label={t('app.sim.catalog.sku')}>
            {(c) => <Input {...c} value={sku} onChange={(e) => setSku(e.target.value)} />}
          </FormField>
        )}
        {select(
          t('app.sim.catalog.kind'),
          kind,
          [
            { value: 'MATERIAL', label: t('app.sim.kind.MATERIAL') },
            { value: 'LABOR', label: t('app.sim.kind.LABOR') },
          ],
          (v) => {
            setKind(v as CatalogKind);
            setCategoryId('');
          },
          Boolean(item),
        )}
        {select(
          t('app.sim.catalog.category'),
          categoryId,
          kindCategories.map((c) => ({ value: c.id, label: c.name })),
          setCategoryId,
        )}
        {select(
          t('app.sim.catalog.unit'),
          unit,
          CATALOG_UNITS.map((u) => ({ value: u, label: t(`app.sim.unit.${u}`) })),
          (v) => setUnit(v as CatalogUnit),
        )}
        {kind === 'MATERIAL' && (
          <FormField label={t('app.sim.catalog.materialPrice')}>
            {(c) => (
              <Input
                {...c}
                inputMode="decimal"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              />
            )}
          </FormField>
        )}
        <FormField label={t('app.sim.catalog.laborPrice')}>
          {(c) => (
            <Input
              {...c}
              inputMode="decimal"
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
            />
          )}
        </FormField>
        {item && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="item-active"
              checked={active}
              onCheckedChange={(v) => setActive(v === true)}
            />
            <Label htmlFor="item-active">{t('app.sim.catalog.active')}</Label>
          </div>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? t('app.crm.common.saving') : t('app.crm.common.save')}
          </Button>
        </div>
      </form>
    </CrmDialog>
  );
}

function PackagesTab() {
  const { t } = useTranslation();
  const query = useCatalogPackages();
  const [editing, setEditing] = useState<CatalogPackage | null>(null);
  if (query.isPending) return <ListSkeleton />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <section className="mt-4 grid gap-3">
      <ul className="grid gap-3 lg:grid-cols-2">
        {query.data.map((pkg) => (
          <li key={pkg.id}>
            <Card className="h-full">
              <CardContent className="grid gap-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-lg font-bold">{pkg.name}</span>
                  <span className="flex gap-2">
                    <Badge variant="primary">{t(`app.sim.tier.${pkg.tier}`)}</Badge>
                    {!pkg.isActive && (
                      <Badge variant="neutral">{t('app.sim.catalog.inactive')}</Badge>
                    )}
                  </span>
                </div>
                {pkg.description && <p className="text-fg-muted">{pkg.description}</p>}
                <p className="text-sm">
                  {t('app.sim.catalog.warranty', { text: pkg.warrantyText })}
                </p>
                <div>
                  <p className="text-sm font-semibold text-fg-muted">
                    {t('app.sim.catalog.includes')}
                  </p>
                  <ul className="mt-1 grid gap-0.5 text-sm">
                    {pkg.items.map((line) => (
                      <li key={line.id}>
                        {line.item.name}
                        {line.defaultMaterialOption ? ` · ${line.defaultMaterialOption.name}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(pkg)}>
                    {t('app.crm.common.edit')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {editing && <PackageDialog pkg={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function PackageDialog({ pkg, onClose }: { pkg: CatalogPackage; onClose: () => void }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const update = useUpdatePackage(pkg.id);
  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description ?? '');
  const [warrantyText, setWarrantyText] = useState(pkg.warrantyText);
  const [years, setYears] = useState(String(pkg.warrantyYears));
  const [active, setActive] = useState(pkg.isActive);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const warrantyYears = Number(years);
    if (!name.trim() || !warrantyText.trim() || !Number.isInteger(warrantyYears)) {
      setError(t('app.crm.common.formErrors'));
      return;
    }
    update.mutate(
      {
        name: name.trim(),
        description: description.trim() || null,
        warrantyText: warrantyText.trim(),
        warrantyYears,
        isActive: active,
      },
      {
        onSuccess: () => {
          toast.success(t('app.sim.catalog.saved'));
          onClose();
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  };

  return (
    <CrmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('app.sim.catalog.editPackage')}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FormField label={t('app.sim.catalog.name')} required>
          {(c) => <Input {...c} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label={t('app.sim.catalog.description')}>
          {(c) => (
            <Textarea {...c} value={description} onChange={(e) => setDescription(e.target.value)} />
          )}
        </FormField>
        <FormField label={t('app.sim.catalog.warrantyText')} required>
          {(c) => (
            <Input {...c} value={warrantyText} onChange={(e) => setWarrantyText(e.target.value)} />
          )}
        </FormField>
        <FormField label={t('app.sim.catalog.warrantyYears')}>
          {(c) => (
            <Input
              {...c}
              inputMode="numeric"
              value={years}
              onChange={(e) => setYears(e.target.value)}
            />
          )}
        </FormField>
        <div className="flex items-center gap-2">
          <Checkbox
            id="package-active"
            checked={active}
            onCheckedChange={(v) => setActive(v === true)}
          />
          <Label htmlFor="package-active">{t('app.sim.catalog.active')}</Label>
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
          <Button type="submit" loading={update.isPending}>
            {update.isPending ? t('app.crm.common.saving') : t('app.crm.common.save')}
          </Button>
        </div>
      </form>
    </CrmDialog>
  );
}
