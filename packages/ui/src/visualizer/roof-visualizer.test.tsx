import { dictionaries } from '@roofing/shared/i18n';
import { roofMaterials, type RoofMaterial } from '@roofing/shared/visualizer';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const webgl = vi.hoisted(() => ({ supported: true }));
const sceneProps = vi.hoisted(() => ({
  last: null as null | Record<string, unknown>,
  throwOnRender: false,
}));

vi.mock('./3d/webgl', () => ({ hasWebGL: () => webgl.supported }));
// La escena 3D (three) no se ejecuta en jsdom: se sustituye por un módulo lazy mínimo.
vi.mock('./3d/scene-canvas', () => ({
  default: (props: Record<string, unknown>) => {
    sceneProps.last = props;
    if (sceneProps.throwOnRender) throw new Error('fallo de render');
    return <canvas data-testid="scene" />;
  },
}));

import { RoofVisualizer } from './roof-visualizer';

const es = dictionaries.es.visualizer;
const en = dictionaries.en.visualizer;

beforeEach(() => {
  webgl.supported = true;
  sceneProps.last = null;
  sceneProps.throwOnRender = false;
});

function setup(props: Partial<Parameters<typeof RoofVisualizer>[0]> = {}) {
  return render(<RoofVisualizer locale="es" labels={es} ctaHref="/es/#contacto" {...props} />);
}

describe('RoofVisualizer (3D)', () => {
  it('expone la selección en el contenedor accesible (role="img" con nombre y descripción)', () => {
    const { container } = setup();
    const box = container.querySelector('[data-shape]')!;
    expect(box).toHaveAttribute('role', 'img');
    expect(box).toHaveAttribute('data-shape', 'gable');
    expect(box).toHaveAttribute('data-material', 'architectural-shingle');
    expect(box).toHaveAttribute('data-color', 'charcoal');
    expect(screen.getByRole('img', { name: es.svgTitle })).toBe(box);
    const desc = document.getElementById(box.getAttribute('aria-describedby')!)!;
    expect(desc).toHaveTextContent(
      'Casa residencial de una planta con techo a dos aguas, en teja asfáltica arquitectónica, color carbón.',
    );
    // El lienzo es decorativo.
    expect(box.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('carga la escena (lazy) y la recibe con la selección', async () => {
    setup();
    expect(await screen.findByTestId('scene')).toBeInTheDocument();
    expect(sceneProps.last).toMatchObject({
      shape: 'gable',
      materialId: 'architectural-shingle',
      hex: '#2f3033',
      view: 'corner',
    });
  });

  it('muestra la carga accesible mientras la escena no está lista', async () => {
    setup();
    const bar = await screen.findByRole('progressbar', { name: es.loading });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('cambiar forma, material y color actualiza atributos, anuncio y escena', async () => {
    const user = userEvent.setup();
    const { container } = setup();
    await screen.findByTestId('scene');
    await user.click(screen.getByRole('radio', { name: 'Cuatro aguas' }));
    await user.click(screen.getByRole('radio', { name: 'Pizarra' }));
    await user.click(screen.getByRole('radio', { name: 'Negro' }));
    const box = container.querySelector('[data-shape]')!;
    expect(box).toHaveAttribute('data-shape', 'hip');
    expect(box).toHaveAttribute('data-material', 'slate');
    expect(box).toHaveAttribute('data-color', 'black');
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Techo, cuatro aguas: Pizarra, color Negro');
    expect(sceneProps.last).toMatchObject({ shape: 'hip', materialId: 'slate', hex: '#2a2d31' });
  });

  it('los radios son nativos y se agrupan en fieldset con leyenda', () => {
    setup();
    for (const legend of [es.shapeLabel, es.materialLabel, es.colorLabel]) {
      const group = screen.getByRole('radiogroup', { name: legend });
      expect(group.tagName).toBe('FIELDSET');
    }
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.every((r) => r.tagName === 'INPUT' && r.type === 'radio')).toBe(true);
  });

  it('tiene tres botones de vista; «Esquina» empieza activa y cada clic cambia la vista', async () => {
    const user = userEvent.setup();
    setup();
    const group = screen.getByRole('group', { name: es.viewLabel });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Frente', 'Esquina', 'Desde arriba']);
    expect(screen.getByRole('button', { name: 'Esquina' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Desde arriba' }));
    expect(screen.getByRole('button', { name: 'Desde arriba' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Esquina' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await waitFor(() => expect(sceneProps.last).toMatchObject({ view: 'top' }));
    await user.click(screen.getByRole('button', { name: 'Frente' }));
    await waitFor(() => expect(sceneProps.last).toMatchObject({ view: 'front' }));
  });

  it('girar la cámara a mano deja los botones sin marcar', async () => {
    setup();
    await screen.findByTestId('scene');
    (sceneProps.last!.onUserRotate as () => void)();
    await waitFor(() => expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0));
  });

  it('textos de las vistas en inglés', () => {
    render(<RoofVisualizer locale="en" labels={en} ctaHref="/en/#contacto" />);
    const group = screen.getByRole('group', { name: en.viewLabel });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Front', 'Corner', 'Top view']);
  });

  it('sin WebGL muestra el aviso de texto, sin lienzo ni botones de vista, y los controles siguen', async () => {
    webgl.supported = false;
    const user = userEvent.setup();
    const { container } = setup();
    expect(await screen.findByText(es.noWebgl)).toBeInTheDocument();
    expect(screen.queryByTestId('scene')).toBeNull();
    expect(screen.queryByRole('group', { name: es.viewLabel })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Cuatro aguas' }));
    expect(container.querySelector('[data-shape]')).toHaveAttribute('data-shape', 'hip');
    expect(screen.getByRole('status')).toHaveTextContent('Techo, cuatro aguas');
  });

  it('onError de la escena muestra el aviso sin WebGL y retira el esqueleto', async () => {
    const { container } = setup();
    await screen.findByTestId('scene');
    act(() => (sceneProps.last!.onError as () => void)());
    expect(await screen.findByText(es.noWebgl)).toBeInTheDocument();
    expect(screen.queryByTestId('scene')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.querySelector('[data-shape]')).toHaveAttribute('data-webgl', 'none');
  });

  it('un error al renderizar la escena (boundary) cae al aviso de texto', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sceneProps.throwOnRender = true;
    setup();
    expect(await screen.findByText(es.noWebgl)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    spy.mockRestore();
  });

  it('al pasar a ready desaparece el esqueleto de carga', async () => {
    setup();
    await screen.findByRole('progressbar', { name: es.loading });
    act(() => (sceneProps.last!.onReady as () => void)());
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
    expect(screen.getByTestId('scene')).toBeInTheDocument();
  });

  it('el botón de solicitud apunta a ctaHref', () => {
    setup();
    expect(screen.getByRole('link', { name: es.cta })).toHaveAttribute('href', '/es/#contacto');
  });

  it('acepta un catálogo propio de materiales', async () => {
    const custom: RoofMaterial[] = [roofMaterials[3]!];
    const user = userEvent.setup();
    setup({ materials: custom, defaultMaterial: 'clay-tile' });
    expect(screen.getAllByRole('radio', { name: /Teja de barro/ })).toHaveLength(1);
    await user.click(screen.getByRole('radio', { name: 'Arena' }));
    await screen.findByTestId('scene');
    expect(sceneProps.last).toMatchObject({ materialId: 'clay-tile', colorId: 'sand' });
  });
});
