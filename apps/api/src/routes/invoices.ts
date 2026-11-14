import { Router } from 'express';
import { z } from 'zod';
import { authContext, currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { scopedWhere, visibleOr404 } from '../auth/scope.js';
import type { Prisma } from '../generated/prisma/client.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { rlsTransaction } from '../lib/rls.js';
import { idParamsSchema, paginationSchema } from '../lib/schemas.js';
import { parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

/**
 * Facturas y pagos SIMULADOS (N17). Son solo registros: no hay pasarela, tarjeta ni cobro real
 * (Stripe queda pendiente a futuro, N15). La oficina «registra» un pago simulado.
 */

const listQuery = paginationSchema.extend({
  status: z.enum(['ISSUED', 'PAID', 'VOID']).optional(),
});

const invoiceSelect = {
  id: true,
  number: true,
  kind: true,
  status: true,
  totalCents: true,
  issuedAt: true,
  dueAt: true,
  paidAt: true,
  project: { select: { id: true, number: true, title: true } },
  customer: { select: { id: true, firstName: true, lastName: true } },
  payments: {
    orderBy: { paidAt: 'asc' },
    select: { id: true, amountCents: true, simulated: true, method: true, paidAt: true },
  },
} as const satisfies Prisma.InvoiceSelect;

export function invoicesRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  const authed = requireAuth(services);
  const office = requireRole('ADMIN', 'SUPERADMIN');

  router.get('/invoices', authed, async (req, res) => {
    const query = parseInput(listQuery, req.query);
    const context = authContext(req);
    const where = scopedWhere('invoice', context, query.status ? { status: query.status } : {});
    const { rows, total } = await rlsTransaction(db, context, async (tx) => ({
      rows: await tx.invoice.findMany({
        where,
        select: invoiceSelect,
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      total: await tx.invoice.count({ where }),
    }));
    res.json({
      invoices: rows,
      page: query.page,
      pageSize: query.pageSize,
      total,
      simulated: true,
    });
  });

  router.get('/invoices/:id', authed, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    const invoice = visibleOr404(
      await rlsTransaction(db, context, (tx) =>
        tx.invoice.findFirst({
          where: scopedWhere('invoice', context, { id }),
          select: invoiceSelect,
        }),
      ),
    );
    res.json({ invoice, simulated: true });
  });

  // «Registrar pago (simulado)»: crea un Payment marcado como simulado y pasa la factura a PAID.
  router.post('/invoices/:id/simulated-payment', authed, office, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    const actor = currentUser(req);
    await rlsTransaction(db, context, async (tx) => {
      const invoice = visibleOr404(
        await tx.invoice.findFirst({
          where: scopedWhere('invoice', context, { id }),
          select: { id: true, status: true, totalCents: true },
        }),
      );
      const notPending = () =>
        new HttpError(409, 'INVALID_TRANSITION', 'La factura no está pendiente de pago');
      if (invoice.status !== 'ISSUED') throw notPending();
      const now = new Date();
      const updated = await tx.invoice.updateMany({
        where: { id, status: 'ISSUED' },
        data: { status: 'PAID', paidAt: now },
      });
      if (updated.count !== 1) throw notPending();
      await tx.payment.createMany({
        data: {
          invoiceId: id,
          amountCents: invoice.totalCents,
          paidAt: now,
          recordedById: actor.id,
        },
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'invoice.payment_simulated',
        entityType: 'invoice',
        entityId: id,
        after: { amountCents: invoice.totalCents },
        ...requestMeta(req),
      });
    });
    const invoice = await rlsTransaction(db, context, (tx) =>
      tx.invoice.findFirstOrThrow({ where: { id }, select: invoiceSelect }),
    );
    res.json({ invoice, simulated: true });
  });

  return router;
}
