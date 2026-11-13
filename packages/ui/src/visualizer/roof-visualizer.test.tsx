import { dictionaries } from '@roofing/shared/i18n';
import { roofMaterials, type RoofMaterial } from '@roofing/shared/visualizer';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RoofVisualizer } from './roof-visualizer';

const es = dictionaries.es.visualizer;
const en = dictionaries.en.visualizer;

/**
 * Radix mueve el foco con un `setTimeout` tras la tecla y marca la opción solo si la flecha
 * sigue pulsada. En un navegador real el usuario aún no la ha soltado; aquí la mantenemos
 * pulsada hasta comprobar el resultado.
 */
async function pressArrow(
  user: ReturnType<typeof userEvent.setup>,
  key: string,
  assertion: () => void,
) {
  await user.keyboard(`{${key}>}`);
  await waitFor(assertion);
  await user.keyboard(`{/${key}}`);
}

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
      'Techo: Teja asfáltica arquitectónica, color Carbón',
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
    expect(svg).toHaveAccessibleDescription(/techo a cuatro aguas, en pizarra, color gris pizarra/i);
  });

  it('cada grupo es un radiogroup con nombre y se maneja con flechas del teclado', async () => {
    const user = userEvent.setup();
    setup();
    const shape = screen.getByRole('radiogroup', { name: 'Forma del techo' });
    screen.getByRole('radiogroup', { name: 'Material' });
    const colors = screen.getByRole('radiogroup', { name: 'Color' });

    await user.tab();
    expect(within(shape).getByRole('radio', { name: 'Dos aguas' })).toHaveFocus();
    await pressArrow(user, 'ArrowRight', () =>
      expect(within(shape).getByRole('radio', { name: 'Cuatro aguas' })).toBeChecked(),
    );

    // Salta a los materiales, luego a los colores, y elige con flechas.
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Teja asfáltica arquitectónica' })).toHaveFocus();
    await user.tab();
    expect(within(colors).getByRole('radio', { name: 'Carbón' })).toHaveFocus();
    await pressArrow(user, 'ArrowRight', () =>
      expect(within(colors).getByRole('radio', { name: 'Gris peltre' })).toBeChecked(),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Techo: Teja asfáltica arquitectónica, color Gris peltre',
    );
  });

  it('anuncia en aria-live el material y el color al cambiar (en inglés también)', async () => {
    const user = userEvent.setup();
    setup({ locale: 'en', labels: en });
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    await user.click(screen.getByRole('radio', { name: 'Standing seam metal' }));
    expect(live).toHaveTextContent('Roof: Standing seam metal, color Matte charcoal');
    await user.click(screen.getByRole('radio', { name: 'Forest green' }));
    expect(live).toHaveTextContent('Roof: Standing seam metal, color Forest green');
  });

  it('al cambiar de material muestra sus colores y vuelve al primero', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('radio', { name: 'Desierto' }));
    await user.click(screen.getByRole('radio', { name: 'Tejuela de cedro' }));
    const colors = within(screen.getByRole('radiogroup', { name: 'Color' })).getAllByRole('radio');
    expect(colors.map((c) => c.textContent)).toEqual(['Natural', 'Envejecido']);
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
    expect(container.querySelector('pattern[data-procedural="architectural-shingle"]')).not.toBeNull();
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

  it('cada material tiene un patrón procedural propio', async () => {
    const user = userEvent.setup();
    const { container } = setup();
    for (const m of roofMaterials) {
      await user.click(screen.getByRole('radio', { name: m.name.es }));
      expect(container.querySelector(`pattern[data-procedural="${m.id}"]`), m.id).not.toBeNull();
    }
  });

  describe('animación al cambiar de material', () => {
    it('superpone la teja nueva sobre la anterior mientras se anima', async () => {
      const user = userEvent.setup();
      const { container } = setup();
      expect(container.querySelectorAll('[data-roof-shape]')).toHaveLength(1);
      await user.click(screen.getByRole('radio', { name: 'Pizarra' }));
      expect(container.querySelectorAll('[data-roof-shape]').length).toBeGreaterThanOrEqual(2);
    });
  });
});
