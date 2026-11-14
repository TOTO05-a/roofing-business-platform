/**
 * Datos de la demo simulada (N17): panel, catálogo, presupuestos, proyectos, facturas y usuarios.
 * Las facturas y los pagos son SIMULADOS: no hay cobros reales. Las fechas llegan en ISO.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { qs } from './crm';
import type { Page } from './types';

export const money = (cents: number, lang: string): string =>
  new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD' }).format(cents / 100);

const PAGE_SIZE = 12;

// ---------- Panel ----------

export interface Dashboard {
  newLeads: number | null;
  weekAppointments: number;
  quotesSent: number;
  quotesApproved: number;
  projectsActive: number;
  projectsCompleted: number;
  collectedCents: number | null;
  pendingCents: number | null;
  upcomingAppointments: {
    id: string;
    type: string;
    startsAt: string;
    status: string;
    customer: { firstName: string; lastName: string };
    property: { addressLine1: string; city: string };
  }[];
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => api<Dashboard>('/api/dashboard', { signal }),
  });
}

// ---------- Catálogo ----------

export type CatalogKind = 'MATERIAL' | 'LABOR';
export const CATALOG_UNITS = ['SQUARE', 'LINEAR_FT', 'UNIT', 'BUNDLE'] as const;
export type CatalogUnit = (typeof CATALOG_UNITS)[number];

export interface CatalogCategory {
  id: string;
  name: string;
  kind: CatalogKind;
  isActive: boolean;
}

export interface CatalogItem {
  id: string;
  sku: string | null;
  name: string;
  kind: CatalogKind;
  unit: CatalogUnit;
  materialPriceCents: number;
  laborPriceCents: number;
  description: string | null;
  isActive: boolean;
  category: { id: string; name: string };
  materialOptions: { id: string; name: string; hex: string | null; kind: string }[];
}

export interface CatalogPackage {
  id: string;
  tier: 'BASIC' | 'BETTER' | 'PREMIUM';
  name: string;
  description: string | null;
  warrantyText: string;
  warrantyYears: number;
  isActive: boolean;
  items: {
    id: string;
    quantityRule: string;
    factor: number | null;
    item: { id: string; name: string };
    defaultMaterialOption: { name: string; hex: string | null } | null;
  }[];
}

export function useCatalogCategories() {
  return useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: ({ signal }) =>
      api<{ categories: CatalogCategory[] }>('/api/catalog/categories', { signal }).then(
        (r) => r.categories,
      ),
  });
}

export function useCatalogItems(filters: {
  kind?: CatalogKind | undefined;
  q?: string;
  page: number;
}) {
  return useQuery({
    queryKey: ['catalog', 'items', filters],
    queryFn: ({ signal }) =>
      api<{ items: CatalogItem[] } & Page>(
        `/api/catalog/items${qs({ ...filters, includeInactive: true, pageSize: PAGE_SIZE })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

export interface CatalogItemInput {
  name: string;
  sku?: string | undefined;
  categoryId: string;
  kind: CatalogKind;
  unit: CatalogUnit;
  materialPriceCents: number;
  laborPriceCents: number;
  description?: string | undefined;
}

export function useCreateCatalogItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CatalogItemInput) => api('/api/catalog/items', { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['catalog'] }),
  });
}

export function useUpdateCatalogItem(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<Omit<CatalogItemInput, 'kind' | 'sku' | 'description'>> & {
        isActive?: boolean;
        description?: string | null;
      },
    ) => api(`/api/catalog/items/${id}`, { method: 'PATCH', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['catalog'] }),
  });
}

export function useCatalogPackages() {
  return useQuery({
    queryKey: ['catalog', 'packages'],
    queryFn: ({ signal }) =>
      api<{ packages: CatalogPackage[] }>('/api/catalog/packages', { signal }).then(
        (r) => r.packages,
      ),
  });
}

export function useUpdatePackage(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name?: string;
      description?: string | null;
      warrantyText?: string;
      warrantyYears?: number;
      isActive?: boolean;
    }) => api(`/api/catalog/packages/${id}`, { method: 'PATCH', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['catalog'] }),
  });
}

// ---------- Presupuestos ----------

export const QUOTE_STATUSES = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'APPROVED',
  'DECLINED',
  'EXPIRED',
  'SUPERSEDED',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export interface QuoteOptionSummary {
  id: string;
  packageId: string;
  tier: 'BASIC' | 'BETTER' | 'PREMIUM';
  title: string;
  totalCents: number;
  depositCents: number;
}

export interface QuoteVersionSummary {
  id: string;
  versionNumber: number;
  status: QuoteStatus;
  locale: string;
  validUntil: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  declinedAt: string | null;
  approvedAt: string | null;
  approvedOptionId: string | null;
  createdAt: string;
  options: QuoteOptionSummary[];
}

export interface QuoteHeader {
  id: string;
  number: string;
  customerId: string;
  propertyId: string;
  createdAt: string;
  customer: { id: string; firstName: string; lastName: string };
  property: {
    id: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    zip: string;
  };
}

export interface QuoteListRow extends QuoteHeader {
  latestVersion: QuoteVersionSummary | null;
}

export function useQuotes(filters: { status?: QuoteStatus | undefined; page: number }) {
  return useQuery({
    queryKey: ['quotes', 'list', filters],
    queryFn: ({ signal }) =>
      api<{ quotes: QuoteListRow[] } & Page>(
        `/api/quotes${qs({ ...filters, pageSize: PAGE_SIZE })}`,
        {
          signal,
        },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useQuote(id: string) {
  return useQuery({
    queryKey: ['quotes', 'detail', id],
    queryFn: ({ signal }) =>
      api<{ quote: QuoteHeader & { versions: QuoteVersionSummary[] } }>(`/api/quotes/${id}`, {
        signal,
      }).then((r) => r.quote),
  });
}

export interface QuoteLine {
  id: string;
  name: string;
  kind: CatalogKind;
  quantity: number;
  purchaseUnitName: string | null;
  purchaseQuantity: number;
  lineTotalCents: number;
  colorName: string | null;
}

export interface QuoteVersionDetail extends QuoteVersionSummary {
  wasteBps: number;
  taxBps: number;
  discountBps: number;
  depositBps: number;
  notes: string | null;
  declineReason: string | null;
  options: (QuoteOptionSummary & {
    warrantyText: string;
    warrantyYears: number;
    materialSubtotalCents: number;
    laborSubtotalCents: number;
    discountCents: number;
    taxCents: number;
    balanceCents: number;
    lines: QuoteLine[];
  })[];
}

export function useQuoteVersion(id: string, versionId: string | undefined) {
  return useQuery({
    queryKey: ['quotes', 'version', id, versionId],
    enabled: Boolean(versionId),
    queryFn: ({ signal }) =>
      api<{ version: QuoteVersionDetail }>(`/api/quotes/${id}/versions/${versionId}`, {
        signal,
      }).then((r) => r.version),
  });
}

export interface QuoteInput {
  propertyId: string;
  packageIds: string[];
  measurements: {
    sections: { name: string; areaSqFt: number; areaKind: 'PLAN'; pitchRise: number }[];
    ridgeFt: number;
    eavesFt: number;
    hipsFt: number;
    valleysFt: number;
    guttersFt: number;
  };
  salesRepId?: string | undefined;
  locale: 'es' | 'en';
}

export function useCreateQuote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: QuoteInput) =>
      api<{ quote: { id: string } }>('/api/quotes', { method: 'POST', body }).then((r) => r.quote),
    onSuccess: () => client.invalidateQueries({ queryKey: ['quotes'] }),
  });
}

function useVersionAction(id: string, versionId: string, action: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown> = {}) =>
      api<{ project?: { id: string; number: string } }>(
        `/api/quotes/${id}/versions/${versionId}/${action}`,
        { method: 'POST', body },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['quotes'] });
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['invoices'] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useSendVersion = (id: string, versionId: string) =>
  useVersionAction(id, versionId, 'send');
export const useViewVersion = (id: string, versionId: string) =>
  useVersionAction(id, versionId, 'view');
export const useDeclineVersion = (id: string, versionId: string) =>
  useVersionAction(id, versionId, 'decline');
/** Aceptación SIMULADA (sin firma legal): crea el proyecto y las facturas simuladas. */
export const useApproveVersion = (id: string, versionId: string) =>
  useVersionAction(id, versionId, 'approve');

export function useQuotePdf() {
  return useMutation({
    mutationFn: ({ id, versionId }: { id: string; versionId: string }) =>
      api<{ url: string }>(`/api/quotes/${id}/versions/${versionId}/pdf`).then((r) => r.url),
  });
}

// ---------- Proyectos ----------

export type ProjectStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
export type StageStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE';

export interface ProjectSummary {
  id: string;
  number: string;
  title: string;
  status: ProjectStatus;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  contractTotalCents: number;
  customer: { id: string; firstName: string; lastName: string };
  property: { id: string; addressLine1: string; city: string; state: string; zip: string };
  stages: { id: string; name: string; sortOrder: number; status: StageStatus }[];
}

export interface ProjectDetail extends ProjectSummary {
  quote: { id: string; number: string };
  quoteVersionId: string;
  assignments: { role: 'CREW_LEAD' | 'CREW_MEMBER'; employeeId: string; name: string }[];
  photos: {
    id: string;
    fileId: string;
    stageId: string | null;
    phase: 'BEFORE' | 'DURING' | 'AFTER';
    caption: string | null;
    takenAt: string | null;
  }[];
  invoices: {
    id: string;
    number: string;
    kind: 'DEPOSIT' | 'BALANCE';
    status: InvoiceStatus;
    totalCents: number;
    dueAt: string;
  }[];
}

export function useProjects(filters: { status?: ProjectStatus | undefined; page: number }) {
  return useQuery({
    queryKey: ['projects', 'list', filters],
    queryFn: ({ signal }) =>
      api<{ projects: ProjectSummary[] } & Page>(
        `/api/projects${qs({ ...filters, pageSize: PAGE_SIZE })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', 'detail', id],
    queryFn: ({ signal }) =>
      api<{ project: ProjectDetail }>(`/api/projects/${id}`, { signal }).then((r) => r.project),
  });
}

function invalidateProjects(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ['projects'] });
  void client.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useSetStage(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, status }: { stageId: string; status: StageStatus }) =>
      api(`/api/projects/${projectId}/stages/${stageId}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => invalidateProjects(client),
  });
}

export function useAssignCrew(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { employeeId: string; role: 'CREW_LEAD' | 'CREW_MEMBER' }) =>
      api(`/api/projects/${projectId}/assignments`, { method: 'POST', body }),
    onSuccess: () => invalidateProjects(client),
  });
}

// ---------- Facturas (simuladas) ----------

export type InvoiceStatus = 'ISSUED' | 'PAID' | 'VOID';

export interface Invoice {
  id: string;
  number: string;
  kind: 'DEPOSIT' | 'BALANCE';
  status: InvoiceStatus;
  totalCents: number;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  project: { id: string; number: string; title: string };
  customer: { id: string; firstName: string; lastName: string };
  payments: {
    id: string;
    amountCents: number;
    simulated: boolean;
    method: string;
    paidAt: string;
  }[];
}

export function useInvoices(filters: { status?: InvoiceStatus | undefined; page: number }) {
  return useQuery({
    queryKey: ['invoices', 'list', filters],
    queryFn: ({ signal }) =>
      api<{ invoices: Invoice[] } & Page>(
        `/api/invoices${qs({ ...filters, pageSize: PAGE_SIZE })}`,
        {
          signal,
        },
      ),
    placeholderData: keepPreviousData,
  });
}

/** «Registrar pago (simulado)»: solo crea un registro; no cobra nada. */
export function useSimulatePayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) =>
      api(`/api/invoices/${invoiceId}/simulated-payment`, { method: 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['invoices'] });
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ---------- Usuarios (superadministración) ----------

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN' | 'SUPERADMIN';
  status: 'ACTIVE' | 'DISABLED';
  twoFactorEnabled: boolean;
  createdAt: string;
}

export function useAdminUsers(filters: { page: number }) {
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: ({ signal }) =>
      api<{ users: AdminUser[] } & Page>(`/api/admin/users${qs({ ...filters, pageSize: 20 })}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}
