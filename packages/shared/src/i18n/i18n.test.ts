import { describe, expect, it } from 'vitest';
import { dictionaries, isLocale, locales } from './index.js';

/** Aplana un diccionario a rutas `a.b.c` con su valor. */
function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const es = flatten(dictionaries.es);
const en = flatten(dictionaries.en);

describe('diccionarios es/en', () => {
  it('tienen exactamente las mismas claves', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it('no tienen textos vacíos', () => {
    for (const dict of [es, en]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), key).not.toBe('');
      }
    }
  });

  it('conservan los mismos marcadores {{variable}} en ambos idiomas', () => {
    const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const key of Object.keys(es)) {
      expect(vars(en[key]!), key).toEqual(vars(es[key]!));
    }
  });

  it('declara es como idioma por defecto', () => {
    expect(locales[0]).toBe('es');
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});
