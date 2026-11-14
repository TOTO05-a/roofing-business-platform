import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { meOf, mockApi, renderPage } from '../../test-utils';
import { LeadDetailPage } from './LeadDetailPage';
import { LeadsPage } from './LeadsPage';

const lead = (over: Record<string, unknown> = {}) => ({
  id: 'l1',
  status: 'CONTACTED',
  source: 'PHONE',
  firstName: 'Ana',
  lastName: 'Ruiz',
  email: 'ana@example.com',
  phone: null,
  addressLine1: null,
  city: null,
  state: null,
  zip: null,
  customerId: null,
  propertyId: null,
  assignedToId: null,
  createdAt: '2026-11-10T10:00:00Z',
  updatedAt: '2026-11-10T10:00:00Z',
  ...over,
});

describe('leads', () => {
  it('lista los leads y muestra el estado vacío', async () => {
    mockApi({
      'GET /api/me': meOf('ADMIN'),
      'GET /api/leads?page=1&pageSize=12': {
        body: { leads: [lead()], page: 1, pageSize: 12, total: 1 },
      },
    });
    renderPage(<LeadsPage />);
    expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument();
    expect(screen.getByText('Contactado')).toBeInTheDocument();
  });

  it('muestra un error de carga con reintento', async () => {
    mockApi({ 'GET /api/me': meOf('ADMIN'), 'GET /api/leads?page=1&pageSize=12': { status: 500 } });
    renderPage(<LeadsPage />);
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('el siguiente estado exige conversión y «perdido» pide el motivo', async () => {
    const { calls } = mockApi({
      'GET /api/me': meOf('ADMIN'),
      'GET /api/leads/l1': { body: { lead: lead() } },
      'GET /api/employees?pageSize=100': { body: { employees: [] } },
      'POST /api/leads/l1/status': (body) => ({
        body: { lead: lead({ status: (body as { status: string }).status }) },
      }),
    });
    renderPage(<LeadDetailPage />, { path: '/leads/:id', initial: '/leads/l1' });
    const next = await screen.findByRole('button', { name: /Cita agendada/ });
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Perdido/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como perdido' }));
    expect(await screen.findByText('El motivo es obligatorio.')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: /Motivo/ }), 'Eligió otra empresa');
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como perdido' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /api/leads/l1/status')?.body).toEqual({
        status: 'LOST',
        lostReason: 'Eligió otra empresa',
      }),
    );
  });

  it('el empleado no ve asignar ni convertir', async () => {
    mockApi({
      'GET /api/me': meOf('EMPLOYEE'),
      'GET /api/leads/l1': { body: { lead: lead() } },
    });
    renderPage(<LeadDetailPage />, { path: '/leads/:id', initial: '/leads/l1' });
    await screen.findByText('Ana Ruiz');
    expect(screen.queryByRole('button', { name: 'Convertir' })).not.toBeInTheDocument();
    expect(screen.queryByText('Responsable')).not.toBeInTheDocument();
  });

  it('un 404 se muestra como registro no encontrado', async () => {
    mockApi({
      'GET /api/me': meOf('ADMIN'),
      'GET /api/leads/l1': { status: 404, body: { error: { code: 'NOT_FOUND', message: 'x' } } },
    });
    renderPage(<LeadDetailPage />, { path: '/leads/:id', initial: '/leads/l1' });
    expect(await screen.findByText('No encontramos este registro')).toBeInTheDocument();
  });
});
