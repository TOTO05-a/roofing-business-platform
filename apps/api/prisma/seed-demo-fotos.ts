/**
 * Fotos de proyectos para la demo: fotos de stock reales (Unsplash, licencias en
 * docs/fotos-demo.md) que ya están en `apps/web/src/assets/proyectos/`. Se reparten como
 * «antes», «durante» y «después»; `variant` elige una distinta por proyecto.
 */
import { readFileSync } from 'node:fs';

export type DemoPhase = 'BEFORE' | 'DURING' | 'AFTER';

const DIR = new URL('../../web/src/assets/proyectos/', import.meta.url);

const FILES: Record<DemoPhase, string[]> = {
  BEFORE: [
    'teja-asfaltica-vista-aerea.jpg',
    'techo-plano-edificio.jpg',
    'techo-plano-casa-moderna.jpg',
  ],
  DURING: ['cuadrilla-instalando-teja.jpg', 'teja-barro-detalle.jpg'],
  AFTER: [
    'casa-palmeras-miami.jpg',
    'casa-orlando.jpg',
    'techo-metal-casa-blanca.jpg',
    'teja-barro-estuco.jpg',
    'techo-plano-casa-moderna.jpg',
  ],
};

export function demoPhoto(phase: DemoPhase, variant: number): { body: Buffer; name: string } {
  const list = FILES[phase];
  const name = list[variant % list.length]!;
  return { body: readFileSync(new URL(name, DIR)), name };
}
