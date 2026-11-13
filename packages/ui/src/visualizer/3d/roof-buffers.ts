import { BufferAttribute, BufferGeometry } from 'three';
import type { RoofData } from './roof-geometry';

export function toGeometry(d: RoofData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(d.positions, 3));
  g.setAttribute('normal', new BufferAttribute(d.normals, 3));
  g.setAttribute('uv', new BufferAttribute(d.uvs, 2));
  // Segundo juego de UV (iguales) para el mapa de oclusión ambiental.
  g.setAttribute('uv1', new BufferAttribute(d.uvs.slice(), 2));
  g.setIndex(new BufferAttribute(d.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Actualiza `g` con `d` reutilizando sus atributos si el número de vértices e índices no cambió;
 * si cambió, devuelve una geometría nueva (la anterior sigue siendo de quien llama).
 */
export function updateGeometry(g: BufferGeometry, d: RoofData): BufferGeometry {
  const pos = g.getAttribute('position');
  const index = g.getIndex();
  if (
    !pos ||
    !index ||
    pos.array.length !== d.positions.length ||
    index.array.length !== d.indices.length ||
    index.array.constructor !== d.indices.constructor
  ) {
    return toGeometry(d);
  }
  (pos.array as Float32Array).set(d.positions);
  (g.getAttribute('normal').array as Float32Array).set(d.normals);
  (g.getAttribute('uv').array as Float32Array).set(d.uvs);
  (g.getAttribute('uv1').array as Float32Array).set(d.uvs);
  (index.array as Uint32Array).set(d.indices);
  for (const name of ['position', 'normal', 'uv', 'uv1']) g.getAttribute(name).needsUpdate = true;
  index.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}
