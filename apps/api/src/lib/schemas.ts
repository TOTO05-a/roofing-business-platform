import { z } from 'zod';

/** Estados de EE. UU. (50 + DC): la misma lista que la función `is_us_state` de la base de datos. */
export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
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

/** Convierte un Decimal de Prisma (o null) en número para la respuesta JSON. */
export function decimalToNumber(value: { toNumber(): number } | null | undefined): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}
