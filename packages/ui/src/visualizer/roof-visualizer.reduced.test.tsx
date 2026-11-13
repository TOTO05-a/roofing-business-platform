import { dictionaries } from '@roofing/shared/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

// El visualizador lee `prefers-reduced-motion` con matchMedia: se simula antes de importarlo.
vi.hoisted(() => {
  globalThis.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof globalThis.matchMedia;
});

const last = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('./3d/webgl', () => ({ hasWebGL: () => true }));
vi.mock('./3d/scene-canvas', () => ({
  default: (props: Record<string, unknown>) => {
    last.props = props;
    return <canvas data-testid="scene" />;
  },
}));

it('con "reducir movimiento" la escena recibe reduced=true y el cambio es inmediato', async () => {
  const { RoofVisualizer } = await import('./roof-visualizer');
  const user = userEvent.setup();
  const { container } = render(
    <RoofVisualizer locale="es" labels={dictionaries.es.visualizer} ctaHref="/es/#contacto" />,
  );
  await screen.findByTestId('scene');
  expect(last.props).toMatchObject({ reduced: true });
  await user.click(screen.getByRole('radio', { name: 'Pizarra' }));
  expect(container.querySelector('[data-shape]')).toHaveAttribute('data-material', 'slate');
  expect(last.props).toMatchObject({ materialId: 'slate', reduced: true });
});
