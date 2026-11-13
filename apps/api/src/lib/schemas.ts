import { z } from 'zod';

/** Estados de EE. UU. (50 + DC): la misma lista que la función `is_us_state` de la base de datos. */
export const US_STATES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
] as const;

export const stateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.enum(US_STATES, { error: 'Usa el código de dos letras de un estado de EE. UU.' }));

/** ZIP de 5 dígitos o ZIP+4 (igual que el CHECK de la base de datos). */
export const zipSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{5}(-[0-9]{4})?$/, 'ZIP inválido (12345 o 12345-6789)');

/** Teléfono en formato internacional E.164, p. ej. +13055550123 (igual que el CHECK). */
export const e164Schema = z
  .string()
  .trim()
  .regex(/^\+[1-9][0-9]{6,14}$/, 'Usa el formato internacional, p. ej. +13055550123');

/** Paginación común de los listados. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamsSchema = z.object({ id: z.uuid() });

/** Texto opcional: la cadena vacía cuenta como ausente. */
export function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );
}

/**
 * Normaliza un teléfono a E.164: quita espacios, guiones, puntos y paréntesis; 10 dígitos
 * (o 11 con un 1 inicial) se toman como EE. UU. (+1). Devuelve null si no parece un teléfono.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  let candidate: string;
  if (trimmed.startsWith('+')) candidate = `+${digits}`;
  else if (digits.length === 10) candidate = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith('1')) candidate = `+${digits}`;
  else return null;
  return /^\+[1-9][0-9]{6,14}$/.test(candidate) ? candidate : null;
}

/** Teléfono libre (con o sin +1) convertido a E.164; si no es válido, error de validación. */
export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.issues.push({
        code: 'custom',
        message: 'Teléfono inválido (10 dígitos de EE. UU. o formato internacional +…)',
        input: value,
      });
      return z.NEVER;
    }
    return phone;
  });

/** Convierte un Decimal de Prisma (o null) en número para la respuesta JSON. */
export function decimalToNumber(value: { toNumber(): number } | null | undefined): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}

/**
 * Quita las claves con valor `undefined` (con `exactOptionalPropertyTypes`, Prisma no las
 * acepta): lo que Zod deja sin enviar no se escribe, y `null` sí vacía el campo.
 */
export function omitUndefined<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
