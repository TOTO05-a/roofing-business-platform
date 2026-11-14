import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, ErrorState } from './display';

describe('Alert', () => {
  it('por defecto no tiene rol de alerta', () => {
    render(<Alert variant="danger">Error</Alert>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('con live anuncia: alert en danger/warning y status en el resto', () => {
    render(
      <>
        <Alert variant="danger" live>
          Peligro
        </Alert>
        <Alert variant="success" live>
          Hecho
        </Alert>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Peligro');
    expect(screen.getByRole('status')).toHaveTextContent('Hecho');
  });
});

describe('ErrorState', () => {
  it('solo es alert con live', () => {
    const { rerender } = render(
      <ErrorState title="Falló" retryLabel="Reintentar" onRetry={() => {}} />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<ErrorState title="Falló" retryLabel="Reintentar" onRetry={() => {}} live />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
