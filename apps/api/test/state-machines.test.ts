import { describe, expect, it } from 'vitest';
import {
  APPOINTMENT_TRANSITIONS,
  checkAppointmentTransition,
} from '../src/domain/appointment-state.js';
import { checkLeadTransition, LEAD_TRANSITIONS } from '../src/domain/lead-state.js';
import { HttpError } from '../src/lib/http-error.js';

const LEADS = Object.keys(LEAD_TRANSITIONS) as (keyof typeof LEAD_TRANSITIONS)[];
const APPS = Object.keys(APPOINTMENT_TRANSITIONS) as (keyof typeof APPOINTMENT_TRANSITIONS)[];

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof HttpError ? error.code : 'OTHER';
  }
}

describe('máquina de estados del lead', () => {
  it('cubre todas las parejas: válidas pasan, inválidas dan INVALID_TRANSITION', () => {
    for (const from of LEADS) {
      for (const to of LEADS) {
        const code = codeOf(() =>
          checkLeadTransition({ from, to, office: true, converted: true, lostReason: 'precio' }),
        );
        if (LEAD_TRANSITIONS[from].includes(to)) expect(code, `${from}->${to}`).toBeNull();
        else expect(code, `${from}->${to}`).toBe('INVALID_TRANSITION');
      }
    }
  });

  it('los terminales no tienen salida', () => {
    for (const status of ['WON', 'SPAM', 'DUPLICATE'] as const) {
      expect(LEAD_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('LOST exige motivo; reabrir y marcar spam solo la oficina; avanzar exige conversión', () => {
    const base = { from: 'NEW', to: 'LOST', office: true, converted: false } as const;
    expect(codeOf(() => checkLeadTransition(base))).toBe('VALIDATION_ERROR');
    expect(codeOf(() => checkLeadTransition({ ...base, lostReason: '   ' }))).toBe(
      'VALIDATION_ERROR',
    );
    expect(checkLeadTransition({ ...base, lostReason: ' sin presupuesto ' }).lostReason).toBe(
      'sin presupuesto',
    );
    const reopen = { from: 'LOST', to: 'CONTACTED', converted: false } as const;
    expect(codeOf(() => checkLeadTransition({ ...reopen, office: false }))).toBe('FORBIDDEN');
    expect(checkLeadTransition({ ...reopen, office: true }).lostReason).toBeNull();
    expect(
      codeOf(() =>
        checkLeadTransition({ from: 'NEW', to: 'SPAM', office: false, converted: false }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      codeOf(() =>
        checkLeadTransition({
          from: 'CONTACTED',
          to: 'APPOINTMENT_SET',
          office: true,
          converted: false,
        }),
      ),
    ).toBe('LEAD_NOT_CONVERTED');
  });
});

describe('máquina de estados de la cita', () => {
  it('cubre todas las parejas', () => {
    for (const from of APPS) {
      for (const to of APPS) {
        const code = codeOf(() =>
          checkAppointmentTransition({ from, to, office: true, cancelReason: 'motivo' }),
        );
        if (APPOINTMENT_TRANSITIONS[from].includes(to)) expect(code, `${from}->${to}`).toBeNull();
        else expect(code, `${from}->${to}`).toBe('INVALID_TRANSITION');
      }
    }
  });

  it('cancelar exige motivo y el empleado solo avanza la visita', () => {
    const check = (
      from: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS',
      to: 'CANCELED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW',
      office: boolean,
    ) => codeOf(() => checkAppointmentTransition({ from, to, office }));
    expect(check('SCHEDULED', 'CANCELED', true)).toBe('VALIDATION_ERROR');
    expect(check('SCHEDULED', 'CONFIRMED', false)).toBe('FORBIDDEN');
    expect(check('CONFIRMED', 'IN_PROGRESS', false)).toBeNull();
    expect(check('IN_PROGRESS', 'COMPLETED', false)).toBeNull();
    expect(check('CONFIRMED', 'NO_SHOW', false)).toBeNull();
  });
});
