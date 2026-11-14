/**
 * Formulario de contacto del sitio público: envía a `POST /api/public/leads` (anti-spam de la
 * API: token con hora de emisión, campo trampa, límites). Sin PUBLIC_API_URL no se envía nada
 * y se muestra un error claro.
 */

export interface FormMessages {
  submitting: string;
  submit: string;
  success: string;
  summary: string;
  required: string;
  invalidEmail: string;
  invalidPhone: string;
  invalidZip: string;
  consentRequired: string;
  errorGeneric: string;
  errorTooMany: string;
  errorUnavailable: string;
}

export interface FormValues {
  name: string;
  email: string;
  phone: string;
  zip: string;
  message: string;
  consent: boolean;
}

export type FieldErrors = Partial<Record<keyof FormValues, string>>;

/** Valida igual que la API (que es quien manda): nombre y correo obligatorios, teléfono de 10 dígitos. */
export function validate(values: FormValues, m: FormMessages): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.name.trim()) errors.name = m.required;
  const email = values.email.trim();
  if (!email) errors.email = m.required;
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = m.invalidEmail;
  const phone = values.phone.trim();
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    const valid = digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
    if (!valid) errors.phone = m.invalidPhone;
  }
  const zip = values.zip.trim();
  if (zip && !/^[0-9]{5}(-[0-9]{4})?$/.test(zip)) errors.zip = m.invalidZip;
  if (!values.consent) errors.consent = m.consentRequired;
  return errors;
}

/** Primer palabra = nombre; el resto = apellido (la API acepta apellido vacío). */
export function splitName(full: string): { firstName: string; lastName?: string } {
  const [first = '', ...rest] = full.trim().split(/\s+/);
  const lastName = rest.join(' ');
  return lastName ? { firstName: first, lastName } : { firstName: first };
}

export function buildPayload(values: FormValues, token: string, trap: string) {
  const phone = values.phone.trim();
  const zip = values.zip.trim();
  const message = values.message.trim();
  return {
    token,
    website_url: trap,
    ...splitName(values.name),
    email: values.email.trim(),
    ...(phone ? { phone } : {}),
    ...(zip ? { zip } : {}),
    ...(message ? { message } : {}),
    utm: readUtm(window.location.search),
  };
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

function readUtm(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) utm[key] = value.slice(0, 200);
  }
  return utm;
}

export async function fetchToken(apiUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiUrl}/api/public/form-token`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: unknown };
    return typeof data.token === 'string' ? data.token : null;
  } catch {
    return null;
  }
}

export type SubmitResult = 'ok' | 'tooMany' | 'error';

export async function submitLead(apiUrl: string, payload: unknown): Promise<SubmitResult> {
  try {
    const res = await fetch(`${apiUrl}/api/public/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 201) return 'ok';
    if (res.status === 429) return 'tooMany';
    return 'error';
  } catch {
    return 'error';
  }
}
