import type { LeadStatus } from '../generated/prisma/client.js';
import { HttpError } from '../lib/http-error.js';
import { assertTransition, type TransitionMap } from './state-machine.js';

/** Máquina de estados del lead (modelo de datos §3). Terminales: WON, SPAM, DUPLICATE. */
export const LEAD_TRANSITIONS: TransitionMap<LeadStatus> = {
  NEW: ['CONTACTED', 'LOST', 'SPAM', 'DUPLICATE'],
  CONTACTED: ['APPOINTMENT_SET', 'LOST'],
  APPOINTMENT_SET: ['INSPECTED', 'LOST'],
  INSPECTED: ['QUOTED', 'LOST'],
  QUOTED: ['WON', 'LOST'],
  // Reabrir un lead perdido: solo la oficina.
  LOST: ['CONTACTED'],
  WON: [],
  SPAM: [],
  DUPLICATE: [],
};

/** Estados que exigen que el lead ya esté convertido en cliente + propiedad (CHECK de la base). */
export const LEAD_CONVERTED_STATUSES: readonly LeadStatus[] = [
  'APPOINTMENT_SET',
  'INSPECTED',
  'QUOTED',
  'WON',
];

export interface LeadTransitionInput {
  from: LeadStatus;
  to: LeadStatus;
  /** ADMIN o SUPERADMIN. */
  office: boolean;
  lostReason?: string | null | undefined;
  converted: boolean;
}

/**
 * Única función que decide si un lead puede cambiar de estado. Devuelve los campos que el
 * cambio debe escribir además del estado.
 */
export function checkLeadTransition(input: LeadTransitionInput): {
  lostReason: string | null;
} {
  const { from, to, office, converted } = input;
  assertTransition('el lead', LEAD_TRANSITIONS, from, to);
  if (from === 'LOST' && !office) {
    throw new HttpError(403, 'FORBIDDEN', 'Solo la oficina puede reabrir un lead perdido');
  }
  if ((to === 'SPAM' || to === 'DUPLICATE') && !office) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Solo la oficina puede marcar un lead como spam o duplicado',
    );
  }
  const reason = input.lostReason?.trim();
  if (to === 'LOST' && !reason) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Indica el motivo por el que se perdió el lead', {
      issues: [{ path: 'lostReason', message: 'Obligatorio al pasar a LOST' }],
    });
  }
  if (LEAD_CONVERTED_STATUSES.includes(to) && !converted) {
    throw new HttpError(
      409,
      'LEAD_NOT_CONVERTED',
      'Convierte el lead en cliente y propiedad antes de avanzar',
    );
  }
  return { lostReason: to === 'LOST' ? (reason ?? null) : null };
}
