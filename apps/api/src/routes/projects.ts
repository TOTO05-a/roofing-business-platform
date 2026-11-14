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
 * Proyectos básicos (N17, modelo §2.7): se crean al aceptar un presupuesto (quotes.ts). La oficina
 * ve todos y asigna la cuadrilla; el cliente ve los suyos (etapas y fotos visibles); la cuadrilla
 * ve los asignados y avanza sus etapas. Las facturas y los pagos son SIMULADOS (invoices.ts).
 */

const listQuery = paginationSchema.extend({
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']).optional(),
});
const stageParams = z.object({ id: z.uuid(), stageId: z.uuid() });
const stagePatch = z.object({ status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE']) }).strict();
const assignBody = z
  .object({
    employeeId: z.uuid(),
    role: z.enum(['CREW_LEAD', 'CREW_MEMBER']).default('CREW_MEMBER'),
  })
  .strict();
const assignParams = z.object({ id: z.uuid(), employeeId: z.uuid() });

/** La cuadrilla no ve precios (P6): el importe del contrato no se le envía. */
function forRole<T extends { contractTotalCents: number }>(project: T, role: string) {
  if (role !== 'EMPLOYEE') return project;
  const { contractTotalCents, ...rest } = project;
  void contractTotalCents;
  return rest;
}

const projectSummarySelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  scheduledStart: true,
  scheduledEnd: true,
  actualStart: true,
  actualEnd: true,
  contractTotalCents: true,
  acceptedAt: true,
  customer: { select: { id: true, firstName: true, lastName: true } },
  property: { select: { id: true, addressLine1: true, city: true, state: true, zip: true } },
  stages: {
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, sortOrder: true, status: true },
  },
} as const satisfies Prisma.ProjectSelect;

export function projectsRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  const authed = requireAuth(services);
  const office = requireRole('ADMIN', 'SUPERADMIN');

  router.get('/projects', authed, async (req, res) => {
    const query = parseInput(listQuery, req.query);
    const context = authContext(req);
    const where = scopedWhere('project', context, query.status ? { status: query.status } : {});
    const { rows, total } = await rlsTransaction(db, context, async (tx) => ({
      rows: await tx.project.findMany({
        where,
        select: projectSummarySelect,
        orderBy: [{ scheduledStart: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      total: await tx.project.count({ where }),
    }));
    res.json({
      projects: rows.map((row) => forRole(row, context.role)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  });

  router.get('/projects/:id', authed, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    const project = await rlsTransaction(db, context, async (tx) =>
      visibleOr404(
        await tx.project.findFirst({
          where: scopedWhere('project', context, { id }),
          select: {
            ...projectSummarySelect,
            quoteId: true,
            quoteVersionId: true,
            quote: { select: { id: true, number: true } },
            assignments: {
              where: { unassignedAt: null },
              orderBy: { assignedAt: 'asc' },
              select: {
                role: true,
                employee: {
                  select: { id: true, user: { select: { name: true } }, jobTypes: true },
                },
              },
            },
            photos: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                fileId: true,
                stageId: true,
                phase: true,
                caption: true,
                takenAt: true,
                visibleToCustomer: true,
              },
            },
            invoices: {
              orderBy: [{ issuedAt: 'asc' }, { kind: 'asc' }],
              select: {
                id: true,
                number: true,
                kind: true,
                status: true,
                totalCents: true,
                dueAt: true,
              },
            },
          },
        }),
      ),
    );
    // La cuadrilla no ve facturas (RLS devuelve lista vacía).
    res.json({
      project: {
        ...forRole(project, context.role),
        assignments: project.assignments.map((a) => ({
          role: a.role,
          employeeId: a.employee.id,
          name: a.employee.user.name,
          jobTypes: a.employee.jobTypes,
        })),
      },
    });
  });

  router.patch('/projects/:id/stages/:stageId', authed, async (req, res) => {
    const { id, stageId } = parseInput(stageParams, req.params);
    const input = parseInput(stagePatch, req.body);
    const context = authContext(req);
    const actor = currentUser(req);
    if (context.role === 'CUSTOMER') {
      throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
    }
    await rlsTransaction(db, context, async (tx) => {
      visibleOr404(
        await tx.project.findFirst({
          where: scopedWhere('project', context, { id }),
          select: { id: true },
        }),
      );
      const stage = visibleOr404(
        await tx.projectStage.findFirst({
          where: { id: stageId, projectId: id },
          select: { id: true },
        }),
      );
      const now = new Date();
      await tx.projectStage.update({
        where: { id: stage.id },
        data: {
          status: input.status,
          startedAt: input.status === 'PENDING' ? null : now,
          completedAt: input.status === 'DONE' ? now : null,
        },
      });
      // El estado del proyecto sigue a sus etapas.
      const stages = await tx.projectStage.findMany({
        where: { projectId: id },
        select: { status: true },
      });
      const allDone = stages.every((s) => s.status === 'DONE');
      const anyStarted = stages.some((s) => s.status !== 'PENDING');
      const current = await tx.project.findFirstOrThrow({
        where: { id },
        select: { status: true, actualStart: true },
      });
      if (current.status !== 'CANCELED') {
        await tx.project.update({
          where: { id },
          data: {
            status: allDone ? 'COMPLETED' : anyStarted ? 'IN_PROGRESS' : 'SCHEDULED',
            actualStart: anyStarted ? (current.actualStart ?? now) : null,
            actualEnd: allDone ? now : null,
          },
        });
      }
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'project.stage_update',
        entityType: 'project',
        entityId: id,
        after: { stageId, status: input.status },
        ...requestMeta(req),
      });
    });
    res.status(204).end();
  });

  router.post('/projects/:id/assignments', authed, office, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(assignBody, req.body);
    const context = authContext(req);
    const actor = currentUser(req);
    await rlsTransaction(db, context, async (tx) => {
      visibleOr404(
        await tx.project.findFirst({
          where: scopedWhere('project', context, { id }),
          select: { id: true },
        }),
      );
      visibleOr404(
        await tx.employeeProfile.findFirst({
          where: { id: input.employeeId, isActive: true, deletedAt: null },
          select: { id: true },
        }),
      );
      await tx.projectAssignment.upsert({
        where: { projectId_employeeId: { projectId: id, employeeId: input.employeeId } },
        create: { projectId: id, employeeId: input.employeeId, role: input.role },
        update: { role: input.role, unassignedAt: null, assignedAt: new Date() },
      });
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'project.assign',
        entityType: 'project',
        entityId: id,
        after: { employeeId: input.employeeId, role: input.role },
        ...requestMeta(req),
      });
    });
    res.status(204).end();
  });

  router.delete('/projects/:id/assignments/:employeeId', authed, office, async (req, res) => {
    const { id, employeeId } = parseInput(assignParams, req.params);
    const context = authContext(req);
    const actor = currentUser(req);
    await rlsTransaction(db, context, async (tx) => {
      const result = await tx.projectAssignment.updateMany({
        where: { projectId: id, employeeId, unassignedAt: null },
        data: { unassignedAt: new Date() },
      });
      if (result.count === 0) throw new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado');
      await recordAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        action: 'project.unassign',
        entityType: 'project',
        entityId: id,
        after: { employeeId },
        ...requestMeta(req),
      });
    });
    res.status(204).end();
  });

  return router;
}
