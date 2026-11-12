// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

type Tokens = Record<string, string>;

/** Extrae las declaraciones `--nombre: valor;` del cuerpo de un bloque. */
function parseDeclarations(body: string): Tokens {
  const out: Tokens = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}

/** Devuelve el cuerpo (entre llaves) que sigue a `selector {`, respetando llaves anidadas. */
function blockBody(source: string, selector: string, from = 0): string {
  const start = source.indexOf(selector, from);
  if (start < 0) throw new Error(`No se encontró ${selector}`);
  let i = source.indexOf('{', start) + 1;
  const begin = i;
  let depth = 1;
  while (depth > 0 && i < source.length) {
    const ch = source[i++];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  return source.slice(begin, i - 1);
}

const lightBase = parseDeclarations(blockBody(css, ':root {'));
const darkAttr = parseDeclarations(blockBody(css, ":root[data-theme='dark']"));
const mediaBlock = blockBody(css, '@media (prefers-color-scheme: dark)');
const darkMedia = parseDeclarations(blockBody(mediaBlock, ":root:not([data-theme='light'])"));

const light: Tokens = lightBase;
const dark: Tokens = { ...lightBase, ...darkAttr };

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Color no válido: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pares [primer plano, fondo] que deben cumplir 4.5:1 (texto, WCAG 1.4.3). */
const textPairs: Array<[string, string]> = [
  ['--fg', '--bg'],
  ['--fg', '--surface'],
  ['--fg', '--surface-alt'],
  ['--fg-muted', '--bg'],
  ['--fg-muted', '--surface'],
  ['--fg-muted', '--surface-alt'],
  ['--link', '--bg'],
  ['--link', '--surface'],
  ['--link', '--surface-alt'],
  ['--primary-fg', '--primary'],
  ['--primary-fg', '--primary-hover'],
  ['--danger-fg', '--danger'],
  ['--on-brand', '--surface-brand'],
  ['--on-brand-muted', '--surface-brand'],
  ['--on-brand-accent', '--surface-brand'],
  ['--success', '--bg'],
  ['--warning', '--bg'],
  ['--danger', '--bg'],
  ['--info', '--bg'],
  ['--success', '--success-soft'],
  ['--warning', '--warning-soft'],
  ['--danger', '--danger-soft'],
  ['--info', '--info-soft'],
  ['--fg', '--success-soft'],
  ['--fg', '--warning-soft'],
  ['--fg', '--danger-soft'],
  ['--fg', '--info-soft'],
];

/** Pares que deben cumplir 3:1 (componentes de interfaz y foco, WCAG 1.4.11). */
const componentPairs: Array<[string, string]> = [
  ['--border-strong', '--bg'],
  ['--border-strong', '--surface'],
  ['--border-strong', '--surface-alt'],
  ['--ring', '--bg'],
  ['--ring', '--surface'],
  ['--ring', '--surface-alt'],
  ['--primary', '--bg'],
  ['--primary', '--surface'],
  ['--primary', '--surface-alt'],
  ['--danger', '--surface'],
  ['--ring-on-brand', '--surface-brand'],
];

describe.each([
  ['claro', light],
  ['oscuro', dark],
] as const)('contraste de tokens (modo %s)', (_name, tokens) => {
  it.each(textPairs)('texto %s sobre %s >= 4.5:1', (fg, bg) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(componentPairs)('componente %s sobre %s >= 3:1', (fg, bg) => {
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe('tokens de marca', () => {
  it('usa los colores de marca acordados en modo claro', () => {
    expect(light['--brand-slate']).toBe('#1e2a38');
    expect(light['--brand-copper']).toBe('#b45309');
    expect(light['--brand-copper-dark']).toBe('#9a4a12');
    expect(light['--brand-sand']).toBe('#f7f5f2');
    expect(light['--fg-muted']).toBe('#475467');
  });

  it('mantiene idénticos los dos bloques oscuros (atributo y media query)', () => {
    expect(darkMedia).toEqual(
      Object.fromEntries(Object.entries(darkAttr).filter(([k]) => k !== 'color-scheme')),
    );
  });

  it('define los tokens de movimiento', () => {
    for (const k of [
      '--duration-fast',
      '--duration-base',
      '--duration-slow',
      '--duration-slower',
    ]) {
      expect(light[k]).toMatch(/^\d+ms$/);
    }
    expect(light['--ease-standard']).toContain('cubic-bezier');
    expect(light['--ease-emphasized']).toContain('cubic-bezier');
  });
});
