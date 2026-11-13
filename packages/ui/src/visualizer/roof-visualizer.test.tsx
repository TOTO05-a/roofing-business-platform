import { dictionaries } from '@roofing/shared/i18n';
import { roofMaterials, type RoofMaterial } from '@roofing/shared/visualizer';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoofVisualizer } from './roof-visualizer';

const es = dictionaries.es.visualizer;
const en = dictionaries.en.visualizer;

interface FakeAnimation {
  el: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancelled: boolean;
  finish: () => void;
}

/** jsdom no implementa la Web Animations API: se simula y se controla cuándo termina cada animación. */
let animations: FakeAnimation[] = [];
let autoFinish = false;

beforeEach(() => {
  animations = [];
  autoFinish = false;
  Element.prototype.animate = function (this: Element, keyframes, options) {
    let finish = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const record: FakeAnimation = {
      el: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      cancelled: false,
      finish,
    };
    animations.push(record);
    if (autoFinish) finish();
    return {
      finished,
      cancel: () => {
        record.cancelled = true;
      },
    } as unknown as Animation;
  };
});

afterEach(() => {
  delete (Element.prototype as { animate?: unknown }).animate;
});

function setup(props: Partial<Parameters<typeof RoofVisualizer>[0]> = {}) {
  return render(<RoofVisualizer locale="es" labels={es} ctaHref="/es/#contacto" {...props} />);
}

describe('RoofVisualizer', () => {
  it('muestra el estado inicial: dos aguas, primer material y color, y el enlace de inspección', () => {
    setup();
    expect(screen.getByRole('radio', { name: 'Dos aguas' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Teja asfáltica arquitectónica' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Carbón' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Techo, dos aguas: Teja asfáltica arquitectónica, color Carbón',
    );
    expect(screen.getByRole('link', { name: 'Solicitar inspección' })).toHaveAttribute(
      'href',
      '/es/#contacto',
    );
  });

  it('el SVG tiene role=img con título y descripción que se actualizan', async () => {
    const user = userEvent.setup();
    setup();
    const svg = screen.getByRole('img', { name: /Vista previa de su techo/ });
    expect(svg).toHaveAccessibleDescription(/techo a dos aguas.*arquitectónica.*carbón/i);
    await user.click(screen.getByRole('radio', { name: 'Cuatro aguas' }));
    await user.click(screen.getByRole('radio', { name: 'Pizarra' }));
    expect(svg).toHaveAccessibleDescription(
      /techo a cuatro aguas, en pizarra, color gris pizarra/i,
    );
  });

  it('cada grupo es un radiogroup con nombre y se maneja con flechas del teclado', async () => {
    const user = userEvent.setup();
    setup();
    const shape = screen.getByRole('radiogroup', { name: 'Forma del techo' });
    screen.getByRole('radiogroup', { name: 'Material' });
    const colors = screen.getByRole('radiogroup', { name: 'Color' });

    await user.tab();
    expect(within(shape).getByRole('radio', { name: 'Dos aguas' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(within(shape).getByRole('radio', { name: 'Cuatro aguas' })).toBeChecked();
    expect(within(shape).getByRole('radio', { name: 'Cuatro aguas' })).toHaveFocus();

    // Salta a los materiales, luego a los colores, y elige con flechas.
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Teja asfáltica arquitectónica' })).toHaveFocus();
    await user.tab();
    expect(within(colors).getByRole('radio', { name: 'Carbón' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(within(colors).getByRole('radio', { name: 'Gris peltre' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Techo, cuatro aguas: Teja asfáltica arquitectónica, color Gris peltre',
    );
  });

  it('la opción elegida no se marca solo con el color: lleva una marca ✓ en las tres secciones', async () => {
    const user = userEvent.setup();
    setup();
    for (const group of ['Forma del techo', 'Material', 'Color']) {
      const checked = within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', {
        checked: true,
      });
      expect(checked.closest('label')?.querySelector('svg.lucide-check'), group).not.toBeNull();
    }
    await user.click(screen.getByRole('radio', { name: 'Cuatro aguas' }));
    const shapeGroup = screen.getByRole('radiogroup', { name: 'Forma del techo' });
    expect(shapeGroup.querySelectorAll('svg.lucide-check')).toHaveLength(1);
    expect(
      within(shapeGroup).getByRole('radio', { name: 'Cuatro aguas' }).closest('label'),
    ).toContainElement(shapeGroup.querySelector('svg.lucide-check') as SVGElement);
  });

  it('anuncia en aria-live el material y el color al cambiar (en inglés también)', async () => {
    const user = userEvent.setup();
    setup({ locale: 'en', labels: en });
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    await user.click(screen.getByRole('radio', { name: 'Standing seam metal' }));
    expect(live).toHaveTextContent('Roof, gable: Standing seam metal, color Matte charcoal');
    await user.click(screen.getByRole('radio', { name: 'Forest green' }));
    expect(live).toHaveTextContent('Roof, gable: Standing seam metal, color Forest green');
    await user.click(screen.getByRole('radio', { name: 'Hip' }));
    expect(live).toHaveTextContent('Roof, hip: Standing seam metal, color Forest green');
  });

  it('al cambiar de material muestra sus colores y vuelve al primero', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: 'Desierto' }));
    await user.click(screen.getByRole('radio', { name: 'Tejuela de cedro' }));
    const colors = within(screen.getByRole('radiogroup', { name: 'Color' })).getAllByRole('radio');
    expect(colors.map((c) => c.closest('label')?.textContent)).toEqual(['Natural', 'Envejecido']);
    expect(colors[0]).toBeChecked();
  });

  it('cambia la forma del techo (dos aguas a cuatro aguas)', async () => {
    const user = userEvent.setup();
    const { container } = setup();
    const svg = container.querySelector('svg[role="img"]')!;
    expect(svg).toHaveAttribute('data-shape', 'gable');
    expect(container.querySelector('[data-roof-shape="gable"]')).not.toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Cuatro aguas' }));
    expect(svg).toHaveAttribute('data-shape', 'hip');
    expect(container.querySelector('[data-roof-shape="hip"]')).not.toBeNull();
  });

  it('usa el patrón procedural de respaldo cuando no hay textureUrl', () => {
    const { container } = setup();
    expect(
      container.querySelector('pattern[data-procedural="architectural-shingle"]'),
    ).not.toBeNull();
    expect(container.querySelector('pattern image')).toBeNull();
  });

  it('con textureUrl usa una imagen teñida con el color; sin ella, cada material usa su patrón', async () => {
    const user = userEvent.setup();
    const materials: readonly RoofMaterial[] = roofMaterials.map((m) =>
      m.id === 'slate' ? { ...m, textureUrl: '/texturas/pizarra.webp' } : m,
    );
    const { container } = setup({ materials });
    expect(container.querySelector('pattern image')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Pizarra' }));
    const image = container.querySelector('pattern image');
    expect(image).toHaveAttribute('href', '/texturas/pizarra.webp');
    expect(container.querySelector('pattern [data-testid="texture-tint"]')).not.toBeNull();
    expect(container.querySelector('pattern[data-procedural="slate"]')).toBeNull();
  });

  it('si la imagen de textura falla, vuelve al patrón procedural', async () => {
    const user = userEvent.setup();
    const materials: readonly RoofMaterial[] = roofMaterials.map((m) =>
      m.id === 'slate' ? { ...m, textureUrl: '/texturas/no-existe.webp' } : m,
    );
    const { container } = setup({ materials });
    await user.click(screen.getByRole('radio', { name: 'Pizarra' }));
    const image = container.querySelector('pattern image');
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    await waitFor(() => expect(container.querySelector('pattern image')).toBeNull());
    expect(container.querySelector('pattern[data-procedural="slate"]')).not.toBeNull();
  });

  it('la celda de la textura es cuadrada para que una foto repetible no se recorte', async () => {
    const user = userEvent.setup();
    const materials: readonly RoofMaterial[] = roofMaterials.map((m) =>
      m.id === 'cedar-shake' ? { ...m, textureUrl: '/texturas/cedro.webp' } : m,
    );
    const { container } = setup({ materials });
    await user.click(screen.getByRole('radio', { name: 'Tejuela de cedro' }));
    const pattern = container.querySelector('pattern[data-texture="cedar-shake"]')!;
    expect(pattern.getAttribute('width')).toBe(pattern.getAttribute('height'));
    const image = pattern.querySelector('image')!;
    expect(image.getAttribute('width')).toBe(image.getAttribute('height'));
  });

  it('cada material tiene un patrón procedural propio', async () => {
    const user = userEvent.setup();
    const { container } = setup();
    for (const m of roofMaterials) {
      await user.click(screen.getByRole('radio', { name: m.name.es }));
      expect(container.querySelector(`pattern[data-procedural="${m.id}"]`), m.id).not.toBeNull();
    }
  });

  it('los ids de la escena llevan el prefijo del componente (dos visualizadores no chocan)', () => {
    const { container } = render(
      <>
        <RoofVisualizer locale="es" labels={es} ctaHref="/a" />
        <RoofVisualizer locale="es" labels={es} ctaHref="/b" />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => id.endsWith('-sky'))).toBe(true);
  });

  describe('animación al cambiar', () => {
    it('superpone la teja nueva sobre la anterior con un barrido de abajo hacia arriba', async () => {
      const user = userEvent.setup();
      const { container } = setup();
      expect(container.querySelectorAll('[data-roof-shape]')).toHaveLength(1);
      await user.click(screen.getByRole('radio', { name: 'Pizarra' }));
      expect(container.querySelectorAll('[data-roof-shape]')).toHaveLength(2);
      expect(animations).toHaveLength(1);
      expect(animations[0]?.keyframes[0]).toMatchObject({ clipPath: 'inset(100% 0% 0% 0%)' });
      animations[0]?.finish();
      await waitFor(() => expect(container.querySelectorAll('[data-roof-shape]')).toHaveLength(1));
    });

    it('un cambio de color solo funde la capa nueva', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(screen.getByRole('radio', { name: 'Gris peltre' }));
      expect(animations).toHaveLength(1);
      expect(animations[0]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    });

    it('cambio de forma con la animación activa: la saliente se funde a 0 a la vez que entra la nueva', async () => {
      const user = userEvent.setup();
      const { container } = setup();
      await user.click(screen.getByRole('radio', { name: 'Cuatro aguas' }));
      // Durante la animación hay dos capas: la dos aguas que sale y la cuatro aguas que entra.
      expect(container.querySelectorAll('[data-roof-shape]')).toHaveLength(2);
      const entering = animations.find(
        (a) => a.keyframes.length === 2 && !a.options.fill?.includes('forwards'),
      );
      const leaving = animations.find((a) => a.options.fill === 'forwards');
      expect(entering?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
      expect(leaving?.keyframes[1]).toEqual({ opacity: 0 });
      expect(leaving?.options.duration).toBe(entering?.options.duration);
      expect(leaving?.el).toBe(container.querySelector('[data-roof-shape="gable"]')?.parentElement);
      expect(entering?.el).toBe(container.querySelector('[data-roof-shape="hip"]')?.parentElement);
    });

    it('tras un cambio de forma queda exactamente 1 capa', async () => {
      autoFinish = true;
      const user = userEvent.setup();
      const { container } = setup();
      await user.click(screen.getByRole('radio', { name: 'Cuatro aguas' }));
      await waitFor(() => expect(container.querySelectorAll('[data-roof-shape]')).toHaveLength(1));
      expect(container.querySelector('[data-roof-shape="hip"]')).not.toBeNull();
      expect(container.querySelector('[data-roof-shape="gable"]')).toBeNull();
      await user.click(screen.getByRole('radio', { name: 'Dos aguas' }));
      await waitFor(() => expect(container.querySelectorAll('[data-roof-shape]')).toHaveLength(1));
      expect(container.querySelector('[data-roof-shape="gable"]')).not.toBeNull();
    });
  });
});
