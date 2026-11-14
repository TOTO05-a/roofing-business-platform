import type { RoofMaterialId } from '@roofing/shared/visualizer';
import {
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { albedoGain, type SurfaceId } from './assets';
import { loadSurface } from './textures';

export const METAL_ID: RoofMaterialId = 'standing-seam-metal';
export const GALVANIZED_ID = 'galvanized';

/** Uniformes del barrido de reinstalación (T21), compartidos por todos los trozos del material. */
export interface WipeUniforms {
  /** 0 = sin barrido, 1 = material saliente (por encima del frente), 2 = material entrante. */
  mode: { value: number };
  /** Altura (m) del frente del barrido. */
  front: { value: number };
  /** Anchura (m) del borde suave. */
  band: { value: number };
}

/** Parte del aspecto que se interpola al cambiar de color. */
export interface Appearance {
  color: Color;
  metalness: number;
  roughness: number;
  clearcoat: number;
}

export interface RoofMaterialHandle {
  id: RoofMaterialId;
  material: MeshPhysicalMaterial;
  wipe: WipeUniforms;
  appearance: Appearance;
  /** Superficie con texturas (todas salvo el metal). */
  surface: SurfaceId | null;
}

const WIPE_GLSL_COMMON = /* glsl */ `
varying float vWipeY;
`;

function addWipe(material: MeshPhysicalMaterial, wipe: WipeUniforms) {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uWipeMode = wipe.mode;
    shader.uniforms.uWipeFront = wipe.front;
    shader.uniforms.uWipeBand = wipe.band;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIPE_GLSL_COMMON}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWipeY = (modelMatrix * vec4(transformed, 1.0)).y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${WIPE_GLSL_COMMON}
        uniform int uWipeMode;
        uniform float uWipeFront;
        uniform float uWipeBand;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float wipeT = 1.0;
        if (uWipeMode != 0) {
          // 1 = ya reinstalado (entrante), 0 = material anterior; el borde se tramea con ruido
          // para que ambos materiales se complementen sin parpadeo ni z-fighting.
          wipeT = clamp((uWipeFront - vWipeY) / uWipeBand * 0.5 + 0.5, 0.0, 1.0);
          float wipeN = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          if (uWipeMode == 1 && wipeN < wipeT) discard;
          if (uWipeMode == 2 && wipeN >= wipeT) discard;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uWipeMode == 2) {
          float wipeGlow = exp(-pow((vWipeY - uWipeFront) / (uWipeBand * 0.45), 2.0));
          totalEmissiveRadiance += vec3(1.0, 0.93, 0.8) * wipeGlow * 0.55;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'roof-wipe-v1';
}

/** Mapa de normales de la ondulación leve («oil canning»): suma de senos periódicos (mosaico sin costuras). */
let oilCanning: DataTexture | null = null;
export function getOilCanningTexture(): DataTexture {
  if (oilCanning) return oilCanning;
  const size = 128;
  const waves = [
    { fx: 4, fy: 1, a: 1, p: 0.3 },
    { fx: 8, fy: 1, a: 0.5, p: 1.7 },
    { fx: 4, fy: 2, a: 0.6, p: 4.1 },
    { fx: 12, fy: 3, a: 0.25, p: 2.4 },
  ];
  const height = (x: number, y: number) =>
    waves.reduce((s, w) => s + w.a * Math.sin(2 * Math.PI * (w.fx * x + w.fy * y) + w.p), 0);
  const data = new Uint8Array(size * size * 4);
  const strength = 0.035;
  const eps = 1 / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = i / size;
      const y = j / size;
      const dx = (height(x + eps, y) - height(x - eps, y)) / (2 * eps);
      const dy = (height(x, y + eps) - height(x, y - eps)) / (2 * eps);
      let nx = -dx * strength * 0.1;
      let ny = -dy * strength * 0.1;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      const o = (j * size + i) * 4;
      data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  // u = ancho (4 ondas por 1,64 m = un valle cada 0,41 m), v = pendiente (3,2 m).
  tex.repeat.set(1 / 1.64, 1 / 3.2);
  tex.colorSpace = NoColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  oilCanning = tex;
  return tex;
}

/**
 * Reflectancia de las cubiertas texturizadas respecto al color de muestra del catálogo: a pleno sol,
 * el hex de la muestra se veía demasiado claro y saturado (p. ej. terracota casi naranja neón).
 */
const ROOF_ALBEDO = 0.7;
/** Desaturación leve hacia la luminancia (los gránulos y la intemperie apagan el color real). */
const ROOF_DESATURATE = 0.18;

/** Aspecto objetivo para un color del catálogo (el tinte se aplica en lineal × ganancia). */
export function appearanceFor(id: RoofMaterialId, colorId: string, hex: string): Appearance {
  const color = new Color(hex); // ColorManagement convierte el hex sRGB a lineal
  if (id === METAL_ID) {
    const bare = colorId === GALVANIZED_ID;
    return {
      color,
      metalness: bare ? 1 : 0,
      roughness: bare ? 0.35 : 0.32,
      clearcoat: bare ? 0 : 1,
    };
  }
  const lum = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  color.lerp(new Color(lum, lum, lum), ROOF_DESATURATE);
  color.multiplyScalar((albedoGain[id as SurfaceId] ?? 1) * ROOF_ALBEDO);
  return { color, metalness: 1, roughness: 1, clearcoat: 0 };
}

export function applyAppearance(h: RoofMaterialHandle, a: Appearance) {
  h.appearance.color.copy(a.color);
  h.appearance.metalness = a.metalness;
  h.appearance.roughness = a.roughness;
  h.appearance.clearcoat = a.clearcoat;
  syncMaterial(h);
}

export function syncMaterial(h: RoofMaterialHandle) {
  const m = h.material;
  const a = h.appearance;
  m.color.copy(a.color);
  m.metalness = a.metalness;
  m.roughness = a.roughness;
  m.clearcoat = a.clearcoat;
}

/** Crea el material de un faldón: carga solo sus texturas (o ninguna, en el metal). */
export async function createRoofMaterial(
  id: RoofMaterialId,
  anisotropy: number,
): Promise<RoofMaterialHandle> {
  const wipe: WipeUniforms = { mode: { value: 0 }, front: { value: -10 }, band: { value: 0.4 } };
  const material = new MeshPhysicalMaterial({ side: DoubleSide });
  let surface: SurfaceId | null = null;
  if (id === METAL_ID) {
    material.normalMap = getOilCanningTexture();
    material.clearcoatRoughness = 0.06;
    material.envMapIntensity = 1.2;
  } else {
    surface = id as SurfaceId;
    const t = await loadSurface(surface, anisotropy);
    material.map = t.color;
    material.normalMap = t.normal;
    material.aoMap = t.orm;
    material.roughnessMap = t.orm;
    material.metalnessMap = t.orm;
  }
  addWipe(material, wipe);
  const handle: RoofMaterialHandle = {
    id,
    material,
    wipe,
    surface,
    appearance: { color: new Color(), metalness: 0, roughness: 1, clearcoat: 0 },
  };
  return handle;
}
