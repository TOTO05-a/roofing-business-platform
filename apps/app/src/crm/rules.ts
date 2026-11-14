import type { Role } from '../navigation';
import type { AppointmentStatus, Lead, LeadStatus } from '../api/types';

/** Espejo de `LEAD_TRANSITIONS` de la API (`domain/lead-state.ts`): la API es la que decide. */
export const LEAD_TRANSITIONS: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  NEW: ['CONTACTED', 'LOST', 'SPAM', 'DUPLICATE'],
  CONTACTED: ['APPOINTMENT_SET', 'LOST'],
  APPOINTMENT_SET: ['INSPECTED', 'LOST'],
  INSPECTED: ['QUOTED', 'LOST'],
  QUOTED: ['WON', 'LOST'],
  LOST: ['CONTACTED'],
  WON: [],
  SPAM: [],
  DUPLICATE: [],
};

const NEEDS_CONVERSION: readonly LeadStatus[] = ['APPOINTMENT_SET', 'INSPECTED', 'QUOTED', 'WON'];
const OFFICE_ONLY_TARGETS: readonly LeadStatus[] = ['SPAM', 'DUPLICATE'];
const CLOSED: readonly LeadStatus[] = ['LOST', 'WON', 'SPAM', 'DUPLICATE'];

export const isOffice = (role: Role) => role === 'administrador' || role === 'superadministrador';

export const isConverted = (lead: Pick<Lead, 'customerId' | 'propertyId'>) =>
  lead.customerId !== null && lead.propertyId !== null;

export interface LeadAction {
  status: LeadStatus;
  /** Si no es null, la acción se muestra desactivada con este motivo. */
  blocked: 'notConverted' | null;
}

/** Cambios de estado que este rol puede pedir para el lead. */
export function leadActions(lead: Lead, role: Role): LeadAction[] {
  const office = isOffice(role);
  if (lead.status === 'LOST' && !office) return [];
  return LEAD_TRANSITIONS[lead.status]
    .filter((to) => office || !OFFICE_ONLY_TARGETS.includes(to))
    .map((status) => ({
      status,
      blocked: NEEDS_CONVERSION.includes(status) && !isConverted(lead) ? 'notConverted' : null,
    }));
}

/** El lead se puede convertir en cliente y propiedad (oficina; ni convertido ni cerrado). */
export function canConvert(lead: Lead, role: Role): boolean {
  return isOffice(role) && !lead.customerId && !lead.propertyId && !CLOSED.includes(lead.status);
}

export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
];

const APPOINTMENT_TRANSITIONS: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  SCHEDULED: ['CONFIRMED', 'CANCELED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELED: [],
  NO_SHOW: [],
  RESCHEDULED: [],
};
const EMPLOYEE_TARGETS: readonly AppointmentStatus[] = ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW'];

/** Cambios de estado de una cita que puede pedir este rol (reprogramar va aparte). */
export function appointmentActions(status: AppointmentStatus, role: Role): AppointmentStatus[] {
  const next = APPOINTMENT_TRANSITIONS[status];
  if (isOffice(role)) return [...next];
  if (role === 'empleado') return next.filter((to) => EMPLOYEE_TARGETS.includes(to));
  return [];
}

/** La API solo reprograma citas programadas o confirmadas, y solo la oficina. */
export const canReschedule = (status: AppointmentStatus, role: Role) =>
  isOffice(role) && (status === 'SCHEDULED' || status === 'CONFIRMED');
