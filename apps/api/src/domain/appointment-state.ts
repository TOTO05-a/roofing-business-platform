import type { AppointmentStatus } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import { assertTransition, type TransitionMap } from './state-machine.js';

/** Máquina de estados de la cita (modelo de datos §3). */
export const APPOINTMENT_TRANSITIONS: TransitionMap<AppointmentStatus> = {
  SCHEDULED: ['CONFIRMED', 'RESCHEDULED', 'CANCELED'],
  CONFIRMED: ['IN_PROGRESS', 'RESCHEDULED', 'CANCELED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELED: [],
  NO_SHOW: [],
  RESCHEDULED: [],
};

/** Estados activos: ocupan agenda y entran en la restricción de no solape de la base. */
export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
];

/** Estados a los que puede llevar la cita el empleado asignado (el resto es de la oficina). */
const EMPLOYEE_TARGETS: readonly AppointmentStatus[] = ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW'];

export interface AppointmentTransitionInput {
  from: AppointmentStatus;
  to: AppointmentStatus;
  office: boolean;
  cancelReason?: string | null | undefined;
}

/** Única función que decide si una cita puede cambiar de estado. */
export function checkAppointmentTransition(input: AppointmentTransitionInput): {
  cancelReason: string | null;
} {
  const { from, to, office } = input;
  assertTransition('la cita', APPOINTMENT_TRANSITIONS, from, to);
  if (!office && !EMPLOYEE_TARGETS.includes(to)) {
    throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para este cambio de estado');
  }
  const reason = input.cancelReason?.trim();
  if (to === 'CANCELED' && !reason) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Indica el motivo de la cancelación', {
      issues: [{ path: 'cancelReason', message: 'Obligatorio al cancelar' }],
    });
  }
  return { cancelReason: to === 'CANCELED' ? (reason ?? null) : null };
}
