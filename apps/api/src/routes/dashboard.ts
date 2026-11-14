import { Router } from 'express';
import { authContext, requireAuth } from '../auth/middleware.js';
import { scopedWhere } from '../auth/scope.js';
import { rlsTransaction } from '../lib/rls.js';
import type { AppServices } from '../services.js';

/**
 * Panel de inicio por rol: cifras sacadas de los datos que ese rol puede ver (mismos filtros de
 * alcance que el resto de la API). Lo que un rol no ve viene como null.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lunes 00:00 de la semana de `now` (hora del servidor). */
function startOfWeek(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function dashboardRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  const authed = requireAuth(services);

  router.get('/dashboard', authed, async (req, res) => {
    const context = authContext(req);
    const isCustomer = context.role === 'CUSTOMER';
    const canSeeMoney = isCustomer || context.role === 'ADMIN' || context.role === 'SUPERADMIN';
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);

    const data = await rlsTransaction(db, context, async (tx) => {
      const versions = (status: 'SENT' | 'VIEWED' | 'APPROVED') =>
        tx.quoteVersion.count({
          where: { AND: [{ quote: scopedWhere('quote', context) }, { status }] },
        });
      const sum = (status: 'PAID' | 'ISSUED') =>
        canSeeMoney
          ? tx.invoice.aggregate({
              where: scopedWhere('invoice', context, { status }),
              _sum: { totalCents: true },
            })
          : null;
      const [
        newLeads,
        weekAppointments,
        sent,
        viewed,
        approved,
        projectsActive,
        projectsCompleted,
        collected,
        pending,
        upcoming,
      ] = await Promise.all([
        isCustomer
          ? null
          : tx.lead.count({ where: scopedWhere('lead', context, { status: 'NEW' }) }),
        tx.appointment.count({
          where: scopedWhere('appointment', context, {
            startsAt: { gte: weekStart, lt: weekEnd },
            status: { notIn: ['CANCELED', 'RESCHEDULED'] },
          }),
        }),
        versions('SENT'),
        versions('VIEWED'),
        versions('APPROVED'),
        tx.project.count({
          where: scopedWhere('project', context, { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } }),
        }),
        tx.project.count({ where: scopedWhere('project', context, { status: 'COMPLETED' }) }),
        sum('PAID'),
        sum('ISSUED'),
        tx.appointment.findMany({
          where: scopedWhere('appointment', context, {
            startsAt: { gte: now },
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
          }),
          orderBy: { startsAt: 'asc' },
          take: 5,
          select: {
            id: true,
            type: true,
            startsAt: true,
            status: true,
            customer: { select: { firstName: true, lastName: true } },
            property: { select: { addressLine1: true, city: true } },
          },
        }),
      ]);
      return {
        newLeads,
        weekAppointments,
        quotesSent: sent + viewed,
        quotesApproved: approved,
        projectsActive,
        projectsCompleted,
        collectedCents: collected ? (collected._sum.totalCents ?? 0) : null,
        pendingCents: pending ? (pending._sum.totalCents ?? 0) : null,
        upcomingAppointments: upcoming,
      };
    });
    res.json(data);
  });

  return router;
}
