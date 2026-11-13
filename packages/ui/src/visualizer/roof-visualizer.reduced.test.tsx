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

it('con "reducir movimiento" el cambio de material es instantáneo (una sola capa)', async () => {
  const { RoofVisualizer } = await import('./roof-visualizer');
  const user = userEvent.setup();
  const { container } = render(
    <RoofVisualizer locale="es" labels={dictionaries.es.visualizer} ctaHref="/es/#contacto" />,
  );
  await user.click(screen.getByRole('radio', { name: 'Pizarra' }));
  expect(container.querySelectorAll('[data-roof-shape]')).toHaveLength(1);
  expect(container.querySelector('pattern[data-procedural="slate"]')).not.toBeNull();
});
