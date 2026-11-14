import type { Dictionary } from '@roofing/shared/i18n';
import { ApiError, NetworkError } from '../api/client';

export type CrmErrorKey = keyof Dictionary['app']['crm']['errors'];

/** Traduce un fallo de la API del CRM a una clave de mensaje (es/en). */
export function crmErrorKey(error: unknown): CrmErrorKey {
  if (error instanceof NetworkError) return 'network';
  if (!(error instanceof ApiError)) return 'generic';
  switch (error.code) {
    case 'APPOINTMENT_OVERLAP':
      return 'overlap';
    case 'LEAD_NOT_CONVERTED':
      return 'leadNotConverted';
    case 'ALREADY_CONVERTED':
      return 'alreadyConverted';
    case 'LEAD_CLOSED':
      return 'leadClosed';
    case 'INVALID_TRANSITION':
      return 'stale';
    case 'NOT_AN_INSPECTION':
      return 'notInspection';
    case 'APPOINTMENT_CLOSED':
      return 'appointmentClosed';
    case 'INSPECTION_COMPLETED':
      return 'inspectionCompleted';
    case 'STORAGE_NOT_CONFIGURED':
      return 'storage';
    case 'UPLOAD_MISSING':
      return 'uploadMissing';
    case 'UPLOAD_MISMATCH':
      return 'uploadMismatch';
    case 'VALIDATION_ERROR':
      return 'validation';
    default:
  }
  if (error.status === 429) return 'tooMany';
  if (error.status === 403) return 'forbidden';
  if (error.status === 404) return 'notFound';
  if (error.status >= 500) return 'server';
  return 'generic';
}

export const isOverlapError = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'APPOINTMENT_OVERLAP';

/** Mensaje bilingüe que devuelve la API para un solape (`messages.es` / `messages.en`). */
export function overlapApiMessage(error: unknown, lang: string): string | null {
  if (!(error instanceof ApiError)) return null;
  const messages = error.details['messages'];
  if (typeof messages !== 'object' || messages === null) return null;
  const text = (messages as Record<string, unknown>)[lang];
  return typeof text === 'string' ? text : null;
}

/** Id de la cita que ocupa el horario, si la API lo indica. */
export function conflictingAppointmentId(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const id = error.details['conflictingAppointmentId'];
  return typeof id === 'string' ? id : null;
}

/** Id de la inspección existente cuando la cita ya tiene una (`INSPECTION_EXISTS`). */
export function existingInspectionId(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'INSPECTION_EXISTS') return null;
  const id = error.details['inspectionId'];
  return typeof id === 'string' ? id : null;
}

export const isNotFound = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 404;
