import { z } from 'zod';

/**
 * Los mensajes son CLAVES de traducción (no texto): así el error sigue el idioma activo.
 * Los límites de contraseña coinciden con los de la API (12–128).
 */
const email = z.string().trim().min(1, 'validation.required').pipe(z.email('validation.email'));
const password = z
  .string()
  .min(1, 'validation.required')
  .min(12, 'validation.passwordMin')
  .max(128, 'validation.passwordMax');
const code6 = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'validation.code6');

export const signInSchema = z.object({
  email,
  // En el acceso solo se exige que no esté vacía: la API decide si es correcta.
  password: z.string().min(1, 'validation.required'),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const forgotSchema = z.object({ email });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const newPasswordSchema = z
  .object({ password, confirm: z.string().min(1, 'validation.required') })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'validation.passwordMatch',
  });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

export const invitationSchema = z
  .object({
    name: z.string().trim().min(1, 'validation.required').max(100),
    password,
    confirm: z.string().min(1, 'validation.required'),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'validation.passwordMatch',
  });
export type InvitationValues = z.infer<typeof invitationSchema>;

export const totpSchema = z.object({ code: code6 });
export type TotpValues = z.infer<typeof totpSchema>;

export const backupCodeSchema = z.object({
  code: z.string().trim().min(1, 'validation.required').max(64),
});
export type BackupCodeValues = z.infer<typeof backupCodeSchema>;

export const confirmPasswordSchema = z.object({
  password: z.string().min(1, 'validation.required'),
});
export type ConfirmPasswordValues = z.infer<typeof confirmPasswordSchema>;
