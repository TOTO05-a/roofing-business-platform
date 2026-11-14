import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../api/client';
import type { Lead } from '../api/types';
import { addDays, fromInputs, layoutDay, startOfWeek, validRange } from './dates';
import {
  conflictingAppointmentId,
  crmErrorKey,
  existingInspectionId,
  overlapApiMessage,
} from './errors';
import { appointmentActions, canConvert, canReschedule, leadActions } from './rules';
import { validatePhoto } from './upload';

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'l1',
  status: 'NEW',
  source: 'PHONE',
  sourceDetail: null,
  firstName: 'Ana',
  lastName: null,
  email: null,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  zip: null,
  message: null,
  spamReason: null,
  assignedToId: null,
  customerId: null,
  propertyId: null,
  lostReason: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('máquina de estados del lead (espejo de la API)', () => {
  it('la oficina ve spam/duplicado; el empleado no', () => {
    const office = leadActions(lead(), 'administrador').map((a) => a.status);
    const staff = leadActions(lead(), 'empleado').map((a) => a.status);
    expect(office).toEqual(['CONTACTED', 'LOST', 'SPAM', 'DUPLICATE']);
    expect(staff).toEqual(['CONTACTED', 'LOST']);
  });

  it('avanzar tras CONTACTED exige conversión', () => {
    const [next] = leadActions(lead({ status: 'CONTACTED' }), 'administrador');
    expect(next).toEqual({ status: 'APPOINTMENT_SET', blocked: 'notConverted' });
    const [ok] = leadActions(
      lead({ status: 'CONTACTED', customerId: 'c', propertyId: 'p' }),
      'administrador',
    );
    expect(ok?.blocked).toBeNull();
  });

  it('solo la oficina reabre un lead perdido', () => {
    expect(leadActions(lead({ status: 'LOST' }), 'empleado')).toEqual([]);
    expect(leadActions(lead({ status: 'LOST' }), 'superadministrador')).toHaveLength(1);
  });

  it('solo se convierte un lead abierto y sin convertir, por la oficina', () => {
    expect(canConvert(lead(), 'administrador')).toBe(true);
    expect(canConvert(lead(), 'empleado')).toBe(false);
    expect(canConvert(lead({ status: 'LOST' }), 'administrador')).toBe(false);
    expect(canConvert(lead({ customerId: 'c', propertyId: 'p' }), 'administrador')).toBe(false);
  });
});

describe('citas', () => {
  it('el empleado solo avanza la visita; la oficina confirma y cancela', () => {
    expect(appointmentActions('CONFIRMED', 'empleado')).toEqual(['IN_PROGRESS', 'NO_SHOW']);
    expect(appointmentActions('SCHEDULED', 'administrador')).toEqual(['CONFIRMED', 'CANCELED']);
    expect(appointmentActions('SCHEDULED', 'cliente')).toEqual([]);
  });

  it('reprogramar: solo oficina y citas programadas o confirmadas', () => {
    expect(canReschedule('SCHEDULED', 'administrador')).toBe(true);
    expect(canReschedule('IN_PROGRESS', 'administrador')).toBe(false);
    expect(canReschedule('SCHEDULED', 'empleado')).toBe(false);
  });
});

describe('fechas de la agenda', () => {
  it('la semana empieza el lunes', () => {
    expect(startOfWeek(new Date(2026, 10, 15)).getDay()).toBe(1); // domingo 15-11-2026
    expect(startOfWeek(new Date(2026, 10, 15)).getDate()).toBe(9);
    expect(addDays(new Date(2026, 10, 30), 1).getMonth()).toBe(11);
  });

  it('valida el rango como la API (fin > inicio, máximo 12 h)', () => {
    const s = fromInputs('2026-11-16', '09:00');
    expect(s).not.toBeNull();
    const ok = fromInputs('2026-11-16', '10:00');
    const long = fromInputs('2026-11-16', '21:30');
    expect(validRange(s!, ok!)).toBe(true);
    expect(validRange(ok!, s!)).toBe(false);
    expect(validRange(s!, long!)).toBe(false);
    expect(fromInputs('mal', '09:00')).toBeNull();
  });

  it('coloca en columnas las citas que se solapan', () => {
    const at = (h: number, e: number) => ({
      startsAt: new Date(2026, 10, 16, h).toISOString(),
      endsAt: new Date(2026, 10, 16, e).toISOString(),
    });
    const placed = layoutDay([at(9, 11), at(10, 12), at(13, 14)]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
  });
});

describe('errores de la API', () => {
  it('traduce códigos a claves de mensaje', () => {
    expect(crmErrorKey(new NetworkError())).toBe('network');
    expect(crmErrorKey(new ApiError(409, 'APPOINTMENT_OVERLAP'))).toBe('overlap');
    expect(crmErrorKey(new ApiError(409, 'LEAD_NOT_CONVERTED'))).toBe('leadNotConverted');
    expect(crmErrorKey(new ApiError(404, 'NOT_FOUND'))).toBe('notFound');
    expect(crmErrorKey(new ApiError(500, null))).toBe('server');
    expect(crmErrorKey(new Error('x'))).toBe('generic');
  });

  it('lee los mensajes bilingües del solape y el id en conflicto', () => {
    const error = new ApiError(409, 'APPOINTMENT_OVERLAP', {
      messages: { es: 'Ocupado', en: 'Busy' },
      conflictingAppointmentId: 'a1',
    });
    expect(overlapApiMessage(error, 'en')).toBe('Busy');
    expect(overlapApiMessage(error, 'fr')).toBeNull();
    expect(conflictingAppointmentId(error)).toBe('a1');
    expect(
      existingInspectionId(new ApiError(409, 'INSPECTION_EXISTS', { inspectionId: 'i1' })),
    ).toBe('i1');
  });
});

describe('fotos', () => {
  it('valida tipo y tamaño antes de subir', () => {
    expect(validatePhoto({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validatePhoto({ type: 'application/pdf', size: 1000 })).toBe('fileType');
    expect(validatePhoto({ type: 'image/png', size: 26 * 1024 * 1024 })).toBe('fileSize');
  });
});
