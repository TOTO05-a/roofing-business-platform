import { z } from 'zod';
import { HttpError } from './http-error.js';

/** Valida con Zod y lanza 400 VALIDATION_ERROR con el detalle por campo. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Datos de entrada inválidos', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

/** Correo normalizado: sin espacios y en minúsculas. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
