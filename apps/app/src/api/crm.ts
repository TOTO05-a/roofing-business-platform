import {
  keepPreviousData,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import type { MANUAL_LEAD_SOURCES } from './types';
import {
  type Appointment,
  type AppointmentStatus,
  type AppointmentType,
  type Customer,
  type Employee,
  type Inspection,
  type InspectionDetail,
  type InspectionSection,
  type Lead,
  type LeadSource,
  type LeadStatus,
  type Page,
  type Property,
  type RoofType,
} from './types';

/** Convierte un objeto en query string, omitiendo lo vacío. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Caché de TanStack Query: datos frescos 30 s; no se reintentan los 4xx (el error ya es claro). */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => {
          const status = (error as { status?: number }).status;
          return (status === undefined || status >= 500) && count < 2;
        },
      },
    },
  });
}

// ---------- Leads ----------

export interface LeadFilters {
  status?: LeadStatus | undefined;
  source?: LeadSource | undefined;
  assignedToId?: string | undefined;
  q?: string | undefined;
  page: number;
}

const PAGE_SIZE = 12;

export function useLeads(filters: LeadFilters) {
  return useQuery({
    queryKey: ['leads', 'list', filters],
    queryFn: ({ signal }) =>
      api<{ leads: Lead[] } & Page>(`/api/leads${qs({ ...filters, pageSize: PAGE_SIZE })}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ['leads', 'detail', id],
    queryFn: ({ signal }) =>
      api<{ lead: Lead }>(`/api/leads/${id}`, { signal }).then((r) => r.lead),
  });
}

export interface LeadInput {
  source: (typeof MANUAL_LEAD_SOURCES)[number];
  firstName: string;
  lastName?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  addressLine1?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  zip?: string | undefined;
  message?: string | undefined;
  assignedToId?: string | undefined;
}

export function useCreateLead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadInput) =>
      api<{ lead: Lead }>('/api/leads', { method: 'POST', body }).then((r) => r.lead),
    onSuccess: () => client.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useAssignLead(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string | null) =>
      api<{ lead: Lead }>(`/api/leads/${id}/assign`, {
        method: 'POST',
        body: { employeeId },
      }).then((r) => r.lead),
    onSuccess: (lead) => {
      client.setQueryData(['leads', 'detail', id], lead);
      void client.invalidateQueries({ queryKey: ['leads', 'list'] });
    },
  });
}

/** Cambio de estado con actualización optimista del detalle; se revierte si la API lo rechaza. */
export function useLeadStatus(id: string) {
  const client = useQueryClient();
  const key = ['leads', 'detail', id] as const;
  return useMutation({
    mutationFn: (input: { status: LeadStatus; lostReason?: string }) =>
      api<{ lead: Lead }>(`/api/leads/${id}/status`, { method: 'POST', body: input }).then(
        (r) => r.lead,
      ),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Lead>(key);
      if (previous) client.setQueryData<Lead>(key, { ...previous, status: input.status });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export interface ConvertInput {
  lastName?: string | undefined;
  property?:
    | { addressLine1: string; city: string; state: string; zip: string; addressLine2?: string }
    | undefined;
}

export function useConvertLead(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ConvertInput) =>
      api<{ lead: Lead; customerId: string; propertyId: string }>(`/api/leads/${id}/convert`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['leads'] });
      void client.invalidateQueries({ queryKey: ['customers'] });
      void client.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

// ---------- Clientes y propiedades ----------

export function useCustomers(filters: { page: number }) {
  return useQuery({
    queryKey: ['customers', 'list', filters],
    queryFn: ({ signal }) =>
      api<{ customers: Customer[] } & Page>(
        `/api/customers${qs({ ...filters, pageSize: PAGE_SIZE })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

/** Directorio de hasta 100 clientes para selectores y nombres (solo la oficina los puede listar). */
export function useCustomerDirectory(enabled: boolean) {
  return useQuery({
    queryKey: ['customers', 'directory'],
    enabled,
    queryFn: ({ signal }) =>
      api<{ customers: Customer[] }>('/api/customers?pageSize=100', { signal }).then(
        (r) => r.customers,
      ),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: ({ signal }) =>
      api<{ customer: Customer }>(`/api/customers/${id}`, { signal }).then((r) => r.customer),
  });
}

export interface CustomerInput {
  firstName: string;
  lastName: string;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  marketingOptIn?: boolean | undefined;
}

export function useCreateCustomer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomerInput) =>
      api<{ customer: Customer }>('/api/customers', { method: 'POST', body }).then(
        (r) => r.customer,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useProperties(filters: {
  q?: string | undefined;
  customerId?: string | undefined;
  page: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['properties', 'list', filters],
    queryFn: ({ signal }) =>
      api<{ properties: Property[] } & Page>(
        `/api/properties${qs({ pageSize: PAGE_SIZE, ...filters })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

/** Directorio de hasta 100 propiedades visibles, para direcciones en citas e inspecciones. */
export function usePropertyDirectory() {
  return useQuery({
    queryKey: ['properties', 'directory'],
    queryFn: ({ signal }) =>
      api<{ properties: Property[] }>('/api/properties?pageSize=100', { signal }).then(
        (r) => r.properties,
      ),
  });
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: ['properties', 'detail', id],
    queryFn: ({ signal }) =>
      api<{ property: Property }>(`/api/properties/${id}`, { signal }).then((r) => r.property),
  });
}

export interface PropertyInput {
  addressLine1: string;
  addressLine2?: string | null | undefined;
  city: string;
  state: string;
  zip: string;
  yearBuilt?: number | null | undefined;
  notes?: string | null | undefined;
}

export function useCreateProperty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: PropertyInput & { customerId: string }) =>
      api<{ property: Property }>('/api/properties', { method: 'POST', body }).then(
        (r) => r.property,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['properties'] }),
  });
}

export function useUpdateProperty(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PropertyInput>) =>
      api<{ property: Property }>(`/api/properties/${id}`, { method: 'PATCH', body }).then(
        (r) => r.property,
      ),
    onSuccess: (property) => {
      client.setQueryData(['properties', 'detail', id], property);
      void client.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export function useDeleteProperty(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/properties/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.removeQueries({ queryKey: ['properties', 'detail', id] });
      void client.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

export function useEmployees(enabled = true) {
  return useQuery({
    queryKey: ['employees'],
    enabled,
    queryFn: ({ signal }) =>
      api<{ employees: Employee[] }>('/api/employees?pageSize=100', { signal }).then(
        (r) => r.employees,
      ),
  });
}

// ---------- Citas ----------

export interface AppointmentFilters {
  from: string;
  to: string;
  assigneeId?: string | undefined;
}

export function useAppointments(filters: AppointmentFilters) {
  return useQuery({
    queryKey: ['appointments', 'list', filters],
    queryFn: ({ signal }) =>
      api<{ appointments: Appointment[] } & Page>(
        `/api/appointments${qs({ ...filters, pageSize: 100 })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAppointmentsOf(filters: { propertyId?: string; customerId?: string }) {
  return useQuery({
    queryKey: ['appointments', 'of', filters],
    queryFn: ({ signal }) =>
      api<{ appointments: Appointment[] }>(`/api/appointments${qs({ ...filters, pageSize: 50 })}`, {
        signal,
      }).then((r) => r.appointments),
  });
}

export interface AppointmentInput {
  customerId: string;
  propertyId: string;
  leadId?: string | undefined;
  assigneeId: string;
  type: AppointmentType;
  startsAt: string;
  endsAt: string;
  notes?: string | undefined;
}

export function useCreateAppointment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AppointmentInput) =>
      api<{ appointment: Appointment }>('/api/appointments', { method: 'POST', body }).then(
        (r) => r.appointment,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['appointments'] });
      void client.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useAppointmentStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: AppointmentStatus; cancelReason?: string }) =>
      api<{ appointment: Appointment }>(`/api/appointments/${input.id}/status`, {
        method: 'POST',
        body: { status: input.status, cancelReason: input.cancelReason },
      }).then((r) => r.appointment),
    onSuccess: () => client.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export function useAssignAppointment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; assigneeId: string }) =>
      api<{ appointment: Appointment }>(`/api/appointments/${input.id}`, {
        method: 'PATCH',
        body: { assigneeId: input.assigneeId },
      }).then((r) => r.appointment),
    onSuccess: () => client.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export interface RescheduleInput {
  id: string;
  startsAt: string;
  endsAt: string;
  assigneeId?: string | undefined;
}

type AppointmentCache = [
  readonly unknown[],
  ({ appointments: Appointment[] } & Page) | undefined,
][];

/**
 * Reprogramar con cambio optimista: la cita se mueve al instante en todas las listas en caché
 * y vuelve a su sitio si la API la rechaza (p. ej. `APPOINTMENT_OVERLAP`).
 */
export function useRescheduleAppointment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: RescheduleInput) =>
      api<{ appointment: Appointment }>(`/api/appointments/${id}/reschedule`, {
        method: 'POST',
        body,
      }),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: ['appointments'] });
      const previous: AppointmentCache = client.getQueriesData({
        queryKey: ['appointments', 'list'],
      });
      client.setQueriesData<{ appointments: Appointment[] } & Page>(
        { queryKey: ['appointments', 'list'] },
        (old) =>
          old && {
            ...old,
            appointments: old.appointments.map((a) =>
              a.id === input.id
                ? {
                    ...a,
                    startsAt: input.startsAt,
                    endsAt: input.endsAt,
                    assigneeId: input.assigneeId ?? a.assigneeId,
                  }
                : a,
            ),
          },
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

// ---------- Inspecciones ----------

export function useInspections(filters: {
  status?: 'DRAFT' | 'COMPLETED' | undefined;
  page: number;
}) {
  return useQuery({
    queryKey: ['inspections', 'list', filters],
    queryFn: ({ signal }) =>
      api<{ inspections: Inspection[] } & Page>(
        `/api/inspections${qs({ ...filters, pageSize: PAGE_SIZE })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
}

export function useInspectionsOf(propertyId: string) {
  return useQuery({
    queryKey: ['inspections', 'of', propertyId],
    queryFn: ({ signal }) =>
      api<{ inspections: Inspection[] }>(`/api/inspections${qs({ propertyId, pageSize: 50 })}`, {
        signal,
      }).then((r) => r.inspections),
  });
}

export function useInspection(id: string) {
  return useQuery({
    queryKey: ['inspections', 'detail', id],
    queryFn: ({ signal }) =>
      api<{ inspection: InspectionDetail }>(`/api/inspections/${id}`, { signal }).then(
        (r) => r.inspection,
      ),
  });
}

export function useStartInspection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) =>
      api<{ inspection: InspectionDetail }>('/api/inspections', {
        method: 'POST',
        body: { appointmentId },
      }).then((r) => r.inspection),
    onSuccess: () => client.invalidateQueries({ queryKey: ['inspections'] }),
  });
}

export interface InspectionPatch {
  roofType?: RoofType | null | undefined;
  roofAgeYears?: number | null | undefined;
  findings?: string | null | undefined;
}

export function useUpdateInspection(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: InspectionPatch) =>
      api<{ inspection: InspectionDetail }>(`/api/inspections/${id}`, {
        method: 'PATCH',
        body,
      }).then((r) => r.inspection),
    onSuccess: (inspection) => client.setQueryData(['inspections', 'detail', id], inspection),
  });
}

export interface SectionInput {
  name: string;
  areaSqft: number;
  pitchRise: number;
  ridgeFt?: number | undefined;
  eaveFt?: number | undefined;
  hipFt?: number | undefined;
  valleyFt?: number | undefined;
  gutterFt?: number | undefined;
  notes?: string | null | undefined;
}

export function useSaveSection(inspectionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, ...body }: SectionInput & { sectionId?: string }) =>
      api<{ section: InspectionSection }>(
        sectionId
          ? `/api/inspections/${inspectionId}/sections/${sectionId}`
          : `/api/inspections/${inspectionId}/sections`,
        { method: sectionId ? 'PATCH' : 'POST', body },
      ).then((r) => r.section),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['inspections', 'detail', inspectionId] }),
  });
}

export function useDeleteSection(inspectionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      api(`/api/inspections/${inspectionId}/sections/${sectionId}`, { method: 'DELETE' }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['inspections', 'detail', inspectionId] }),
  });
}

export function useCompleteInspection(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/inspections/${id}/complete`, { method: 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['inspections'] });
      void client.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

/** URL GET firmada de una foto (vive poco: se pide al mostrarla y se renueva con la caché). */
export function usePhotoUrl(fileId: string) {
  return useQuery({
    queryKey: ['files', fileId, 'url'],
    staleTime: 2 * 60_000,
    queryFn: ({ signal }) =>
      api<{ url: string; mimeType: string }>(`/api/files/${fileId}/download`, { signal }),
  });
}
