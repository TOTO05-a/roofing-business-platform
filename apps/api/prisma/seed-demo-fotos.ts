/**
 * Fotos ficticias de proyectos para la demo: imágenes PNG generadas en código (una casa
 * esquemática con el techo «antes», «durante» y «después»). No son fotos de personas ni de
 * propiedades reales. Sin dependencias: PNG sin comprimir por filtros, con zlib de Node.
 */
import { crc32, deflateSync } from 'node:zlib';

type Rgb = [number, number, number];
export type DemoPhase = 'BEFORE' | 'DURING' | 'AFTER';

const WIDTH = 640;
const HEIGHT = 400;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function encodePng(pixel: (x: number, y: number) => Rgb): Buffer {
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  let offset = 0;
  for (let y = 0; y < HEIGHT; y++) {
    raw[offset++] = 0; // filtro: ninguno
    for (let x = 0; x < WIDTH; x++) {
      const [r, g, b] = pixel(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; // 8 bits por canal
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

// Casa: pared x 150..490, y 210..340; techo triangular de (110,210) a (530,210) con cima (320,90).
function inRoof(x: number, y: number): boolean {
  if (y < 90 || y > 210) return false;
  const half = ((y - 90) / 120) * 210;
  return Math.abs(x - 320) <= half;
}

/** Hash determinista y barato para el «ruido» del techo viejo. */
const noise = (x: number, y: number): number => ((x * 73856093) ^ (y * 19349663)) % 97;

export function demoPhoto(phase: DemoPhase, variant: 0 | 1): Buffer {
  const newRoof: Rgb = variant === 0 ? [168, 66, 40] : [62, 74, 92];
  const oldRoof: Rgb = [92, 80, 70];
  return encodePng((x, y) => {
    if (inRoof(x, y)) {
      const stripe = y % 7 === 0 ? 0.82 : 1;
      const isNew = phase === 'AFTER' || (phase === 'DURING' && x < 320 && y > 130);
      let color: Rgb;
      if (isNew) color = mix([0, 0, 0], newRoof, stripe);
      else {
        const patch = noise(x >> 3, y >> 3) < 14;
        color = mix([0, 0, 0], patch ? [55, 48, 42] : oldRoof, stripe);
      }
      if (phase === 'DURING' && x >= 320 && y > 150 && y < 175) return [38, 90, 160]; // lona azul
      return color;
    }
    if (x >= 150 && x <= 490 && y > 210 && y <= 340) {
      if (x >= 300 && x <= 340 && y >= 270) return [86, 58, 40]; // puerta
      if (((x >= 190 && x <= 250) || (x >= 390 && x <= 450)) && y >= 245 && y <= 295)
        return [150, 190, 215]; // ventanas
      return [226, 214, 190]; // pared
    }
    if (y > 340) return mix([96, 140, 84], [70, 110, 64], (y - 340) / 60); // césped
    return mix([140, 190, 235], [214, 233, 247], y / 340); // cielo
  });
}
