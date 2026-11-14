import type * as Three from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Textures from './textures';

const loads = vi.hoisted(() => ({ fail: false, count: 0, disposed: [] as string[] }));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof Three>();
  class FakeLoader {
    async loadAsync(url: string) {
      loads.count++;
      if (loads.fail) throw new Error('sin red');
      return { url, repeat: { set() {} }, dispose: () => loads.disposed.push(url) };
    }
  }
  return { ...actual, TextureLoader: FakeLoader };
});

type Mod = typeof Textures;
let mod: Mod;

beforeEach(async () => {
  vi.resetModules();
  loads.fail = false;
  loads.count = 0;
  loads.disposed = [];
  mod = await import('./textures');
});

describe('referencias de superficies', () => {
  it('comparte la carga y solo libera al soltar la última referencia', async () => {
    const [a, b] = await Promise.all([mod.loadSurface('slate'), mod.loadSurface('slate')]);
    expect(a).toBe(b);
    expect(loads.count).toBe(3);
    mod.releaseSurface('slate');
    expect(loads.disposed).toHaveLength(0);
    mod.releaseSurface('slate');
    expect(loads.disposed).toHaveLength(3);
  });

  it('tras liberar del todo, la siguiente carga vuelve a pedir las texturas', async () => {
    await mod.loadSurface('slate');
    mod.releaseSurface('slate');
    await mod.loadSurface('slate');
    expect(loads.count).toBe(6);
  });

  it('una carga fallida no deja referencias ni caché', async () => {
    loads.fail = true;
    await expect(mod.loadSurface('slate')).rejects.toMatchObject({ message: 'sin red' });
    loads.fail = false;
    await mod.loadSurface('slate');
    mod.releaseSurface('slate');
    expect(loads.disposed).toHaveLength(3);
  });

  it('superficies distintas no se afectan', async () => {
    await mod.loadSurface('slate');
    await mod.loadSurface('grass');
    mod.releaseSurface('slate');
    expect(loads.disposed).toHaveLength(3);
    mod.releaseSurface('grass');
    expect(loads.disposed).toHaveLength(6);
  });
});
