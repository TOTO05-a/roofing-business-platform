import { describe, expect, it } from 'vitest';
import { formatUsd } from './format.js';
import { healthResponseSchema } from './schemas.js';

describe('formatUsd', () => {
  it('formatea en inglés', () => {
    expect(formatUsd(1234.5, 'en')).toBe('$1,234.50');
  });

  it('formatea en español de Estados Unidos', () => {
    expect(formatUsd(1234.5, 'es')).toMatch(/^\$\s?1,234\.50$/);
  });

  it('usa español por defecto y maneja cero', () => {
    expect(formatUsd(0)).toMatch(/^\$\s?0\.00$/);
  });
});

describe('healthResponseSchema', () => {
  it('acepta {status:"ok"} y rechaza otros valores', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
    expect(healthResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
  });
});
