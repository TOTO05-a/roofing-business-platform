import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('ejecuta onClick en estado normal', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enviar</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('en estado loading marca aria-busy, muestra el indicador y bloquea clics', async () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Enviando" onClick={onClick}>
        Enviar
      </Button>,
    );
    const button = screen.getByRole('button', { name: /Enviar/ });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button.querySelector('svg.animate-spin')).not.toBeNull();
    expect(screen.getByText('Enviando')).toHaveClass('sr-only');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sin loading no declara aria-busy', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button', { name: 'Ok' })).not.toHaveAttribute('aria-busy');
  });

  it('usa type="button" por defecto', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button', { name: 'Ok' })).toHaveAttribute('type', 'button');
  });
});

describe('Button asChild', () => {
  it('avisa en desarrollo si recibe loading o disabled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Button asChild disabled>
        <a href="/x">Ir</a>
      </Button>,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('no avisa sin loading ni disabled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Button asChild>
        <a href="/x">Ir</a>
      </Button>,
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
