import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { authContext, currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { scopedWhere, scopes, visibleOr404 } from '../auth/scope.js';
import {
  calculateForPackages,
  DEFAULT_PARAMETERS,
  measurementsFromInspection,
  measurementsSnapshotSchema,
  parametersInputSchema,
  roofMeasurementsSchema,
  snapshotOf,
  storeOptions,
} from '../domain/quote-calc.js';
import type { Prisma } from '../generated/prisma/client.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { rlsTransaction, type RlsTx } from '../lib/rls.js';
import { idParamsSchema, omitUndefined, optionalText, paginationSchema } from '../lib/schemas.js';
import { parseInput } from '../lib/validation.js';
import { renderQuotePdf, type QuotePdfData } from '../pdf/quote-pdf.js';
import type { AppServices } from '../services.js';

/**
 * Presupuestos (modelo §2.5 y §3; P3–P13). Estados de la demo (N14): DRAFT → SENT → VIEWED,
 * DECLINED, EXPIRED y SUPERSEDED. La aprobación con firma electrónica no está en esta etapa (N7).
 *
 * Quién puede qué: la oficina (ADMIN/SUPERADMIN) crea, calcula, aplica descuento (P10) y envía;
 * ventas ve los precios de SUS presupuestos; la cuadrilla no ve ninguno; el cliente ve los suyos
 * ya enviados y puede marcarlos vistos o rechazarlos. La RLS lo garantiza también en la base.
 */

const MAX_PACKAGES = 10;
const DEFAULT_VALIDITY_DAYS = 30;

const parametersSchema = parametersInputSchema;
const localeSchema = z.enum(['es', 'en']);
const packageIdsSchema = z.array(z.uuid()).min(1).max(MAX_PACKAGES);
const futureDate = z.iso
  .datetime({ offset: true })
  .transform((v) => new Date(v))
  .refine((d) => d.getTime() > Date.now(), 'La fecha debe ser futura');

const createSchema = z
  .object({
    propertyId: z.uuid(),
    inspectionId: z.uuid().optional(),
    measurements: roofMeasurementsSchema.optional(),
    salesRepId: z.uuid().optional(),
    packageIds: packageIdsSchema,
    parameters: parametersSchema.optional(),
    locale: localeSchema.default('es'),
    notes: optionalText(2000),
  })
  .strict()
  .refine((v) => (v.inspectionId === undefined) !== (v.measurements === undefined), {
    message: 'Indica una inspección completada o las medidas, pero no ambas',
    path: ['inspectionId'],
  });

const patchSchema = z
  .object({
    packageIds: packageIdsSchema,
    parameters: parametersSchema,
    measurements: roofMeasurementsSchema,
    locale: localeSchema,
    notes: z.union([optionalText(2000), z.null()]),
    validUntil: z.union([futureDate, z.null()]),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'No hay nada que cambiar');

const sendSchema = z.object({ validUntil: futureDate.optional() }).strict();
const declineSchema = z.object({ reason: optionalText(1000) }).strict();
const versionParams = z.object({ id: z.uuid(), versionId: z.uuid() });

const listQuery = paginationSchema.extend({
  customerId: z.uuid().optional(),
  status: z.enum(['DRAFT', 'SENT', 'VIEWED', 'DECLINED', 'EXPIRED', 'SUPERSEDED']).optional(),
});

const versionSummarySelect = {
  id: true,
  versionNumber: true,
  status: true,
  locale: true,
  validUntil: true,
  sentAt: true,
  viewedAt: true,
  declinedAt: true,
  expiredAt: true,
  supersededAt: true,
  lockedAt: true,
  createdAt: true,
} as const satisfies Prisma.QuoteVersionSelect;

const quoteSelect = {
  id: true,
  number: true,
  customerId: true,
  propertyId: true,
  inspectionId: true,
  salesRepId: true,
  createdAt: true,
  customer: { select: { id: true, firstName: true, lastName: true } },
  property: {
    select: {
      id: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      zip: true,
    },
  },
} as const satisfies Prisma.QuoteSelect;

const optionSummarySelect = {
  id: true,
  packageId: true,
  tier: true,
  title: true,
  totalCents: true,
  depositCents: true,
} as const satisfies Prisma.QuoteOptionSelect;

const versionDetailSelect = {
  ...versionSummarySelect,
  wasteBps: true,
  taxBps: true,
  taxAppliesToLabor: true,
  discountBps: true,
  depositBps: true,
  measurementsSnapshot: true,
  notes: true,
  declineReason: true,
  pdfSha256: true,
  options: {
    orderBy: { sortOrder: 'asc' },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  },
} as const satisfies Prisma.QuoteVersionSelect;

type DetailRow = Prisma.QuoteVersionGetPayload<{ select: typeof versionDetailSelect }>;

function serializeVersion(row: DetailRow) {
  return {
    ...row,
    options: row.options.map((option) => ({
      ...option,
      lines: option.lines.map((line) => ({
        ...line,
        quantity: line.quantity.toNumber(),
        purchaseQuantity: line.purchaseQuantity.toNumber(),
      })),
    })),
  };
}

function invalidTransition(from: string, to: string): HttpError {
  return new HttpError(409, 'INVALID_TRANSITION', `No se puede pasar de ${from} a ${to}`);
}

export function quotesRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  const authed = requireAuth(services);
  const office = requireRole('ADMIN', 'SUPERADMIN');

  async function audit(
    tx: RlsTx,
    req: Parameters<typeof requestMeta>[0] & Parameters<typeof currentUser>[0],
    action: string,
    quoteId: string,
    after?: Record<string, string | number | boolean | null>,
  ) {
    const actor = currentUser(req);
    await recordAudit(tx, {
      actorUserId: actor.id,
      actorEmail: actor.email,
      action,
      entityType: 'quote',
      entityId: quoteId,
      ...(after ? { after } : {}),
      ...requestMeta(req),
    });
  }

  /** Versión visible para quien pregunta (404 si no existe o no es visible). */
  async function versionOr404(
    tx: RlsTx,
    context: ReturnType<typeof authContext>,
    id: string,
    versionId: string,
  ) {
    return visibleOr404(
      await tx.quoteVersion.findFirst({
        where: { AND: [scopes.quoteVersion(context), { id: versionId, quoteId: id }] },
        select: { id: true, quoteId: true, versionNumber: true, status: true, validUntil: true },
      }),
    );
  }

  async function draftOr409(
    tx: RlsTx,
    context: ReturnType<typeof authContext>,
    id: string,
    versionId: string,
  ) {
    const version = await versionOr404(tx, context, id, versionId);
    if (version.status !== 'DRAFT') {
      throw new HttpError(
        409,
        'VERSION_LOCKED',
        'La versión ya fue enviada: crea una nueva versión',
      );
    }
    return version;
  }

  // --- Crear ---------------------------------------------------------------------------------
  router.post('/quotes', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const context = authContext(req);
    const input = parseInput(createSchema, req.body);
    const parameters = { ...DEFAULT_PARAMETERS, ...omitUndefined(input.parameters ?? {}) };
    const created = await rlsTransaction(db, context, async (tx) => {
      const property = visibleOr404(
        await tx.property.findFirst({
          where: scopedWhere('property', context, { id: input.propertyId }),
          select: { id: true, customerId: true },
        }),
      );
      if (input.salesRepId) {
        const rep = await tx.employeeProfile.findFirst({
          where: {
            id: input.salesRepId,
            deletedAt: null,
            isActive: true,
            jobTypes: { has: 'SALES' },
          },
          select: { id: true },
        });
        if (!rep) throw new HttpError(404, 'NOT_FOUND', 'Vendedor no encontrado');
      }
      const measurements = input.inspectionId
        ? await measurementsFromInspection(tx, input.inspectionId, property.id)
        : input.measurements!;
      const calculation = await calculateForPackages(
        tx,
        input.packageIds,
        measurements,
        parameters,
      );
      const quote = await tx.quote.create({
        data: {
          customerId: property.customerId,
          propertyId: property.id,
          inspectionId: input.inspectionId ?? null,
          salesRepId: input.salesRepId ?? null,
          createdById: actor.id,
        },
        select: { id: true, number: true },
      });
      const version = await tx.quoteVersion.create({
        data: {
          quoteId: quote.id,
          versionNumber: 1,
          locale: input.locale,
          ...parameters,
          measurementsSnapshot: snapshotOf(measurements),
          notes: input.notes ?? null,
          createdById: actor.id,
        },
        select: { id: true },
      });
      await storeOptions(tx, version.id, calculation);
      await audit(tx, req, 'quote.create', quote.id, { number: quote.number });
      return { quoteId: quote.id, versionId: version.id };
    });
    const { quote, version } = await readQuoteVersion(created.quoteId, created.versionId, context);
    res.status(201).json({ quote, version });
  });

  async function readQuoteVersion(
    id: string,
    versionId: string,
    context: ReturnType<typeof authContext>,
  ) {
    return rlsTransaction(db, context, async (tx) => {
      const quote = visibleOr404(
        await tx.quote.findFirst({
          where: scopedWhere('quote', context, { id }),
          select: quoteSelect,
        }),
      );
      const version = visibleOr404(
        await tx.quoteVersion.findFirst({
          where: { AND: [scopes.quoteVersion(context), { id: versionId, quoteId: id }] },
          select: versionDetailSelect,
        }),
      );
      return { quote, version: serializeVersion(version) };
    });
  }

  // --- Leer ----------------------------------------------------------------------------------
  router.get('/quotes', authed, async (req, res) => {
    const query = parseInput(listQuery, req.query);
    const context = authContext(req);
    const where = scopedWhere('quote', context, {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { versions: { some: { status: query.status } } } : {}),
    });
    const { rows, total } = await rlsTransaction(db, context, async (tx) => ({
      rows: await tx.quote.findMany({
        where,
        select: {
          ...quoteSelect,
          versions: {
            where:
              context.role === 'ADMIN' || context.role === 'SUPERADMIN'
                ? {}
                : { status: { not: 'DRAFT' } },
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: {
              ...versionSummarySelect,
              options: { orderBy: { sortOrder: 'asc' }, select: optionSummarySelect },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      total: await tx.quote.count({ where }),
    }));
    res.json({
      quotes: rows.map(({ versions, ...quote }) => ({
        ...quote,
        latestVersion: versions[0] ?? null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  });

  router.get('/quotes/:id', authed, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    const quote = await rlsTransaction(db, context, async (tx) => {
      const found = visibleOr404(
        await tx.quote.findFirst({
          where: scopedWhere('quote', context, { id }),
          select: quoteSelect,
        }),
      );
      const versions = await tx.quoteVersion.findMany({
        where: { AND: [scopes.quoteVersion(context), { quoteId: id }] },
        orderBy: { versionNumber: 'desc' },
        select: {
          ...versionSummarySelect,
          options: { orderBy: { sortOrder: 'asc' }, select: optionSummarySelect },
        },
      });
      return { ...found, versions };
    });
    res.json({ quote });
  });

  router.get('/quotes/:id/versions/:versionId', authed, async (req, res) => {
    const { id, versionId } = parseInput(versionParams, req.params);
    res.json(await readQuoteVersion(id, versionId, authContext(req)));
  });

  // --- Editar el borrador --------------------------------------------------------------------
  router.patch('/quotes/:id/versions/:versionId', authed, office, async (req, res) => {
    const { id, versionId } = parseInput(versionParams, req.params);
    const input = parseInput(patchSchema, req.body);
    const context = authContext(req);
    await rlsTransaction(db, context, async (tx) => {
      await draftOr409(tx, context, id, versionId);
      const current = await tx.quoteVersion.findUniqueOrThrow({
        where: { id: versionId },
        select: {
          wasteBps: true,
          taxBps: true,
          taxAppliesToLabor: true,
          discountBps: true,
          depositBps: true,
          measurementsSnapshot: true,
          options: { orderBy: { sortOrder: 'asc' }, select: { packageId: true } },
        },
      });
      const parameters = {
        wasteBps: current.wasteBps,
        taxBps: current.taxBps,
        taxAppliesToLabor: current.taxAppliesToLabor,
        discountBps: current.discountBps,
        depositBps: current.depositBps,
        ...omitUndefined(input.parameters ?? {}),
      };
      const measurements =
        input.measurements ??
        measurementsSnapshotSchema.parse(current.measurementsSnapshot).measurements;
      const packageIds = input.packageIds ?? current.options.map((o) => o.packageId);
      const calculation = await calculateForPackages(tx, packageIds, measurements, parameters);
      await tx.quoteVersion.update({
        where: { id: versionId },
        data: {
          ...parameters,
          ...(input.locale ? { locale: input.locale } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
          ...(input.measurements ? { measurementsSnapshot: snapshotOf(measurements) } : {}),
        },
      });
      await storeOptions(tx, versionId, calculation);
      await audit(tx, req, 'quote.version.update', id, {
        versionId,
        fields: Object.keys(input).join(','),
        discountBps: parameters.discountBps,
      });
    });
    res.json(await readQuoteVersion(id, versionId, context));
  });

  // --- Nueva versión (revisión) ---------------------------------------------------------------
  router.post('/quotes/:id/versions', authed, office, async (req, res) => {
    const actor = currentUser(req);
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    const versionId = await rlsTransaction(db, context, async (tx) => {
      visibleOr404(
        await tx.quote.findFirst({
          where: scopedWhere('quote', context, { id }),
          select: { id: true },
        }),
      );
      const latest = await tx.quoteVersion.findFirstOrThrow({
        where: { quoteId: id },
        orderBy: { versionNumber: 'desc' },
        select: {
          versionNumber: true,
          status: true,
          locale: true,
          wasteBps: true,
          taxBps: true,
          taxAppliesToLabor: true,
          discountBps: true,
          depositBps: true,
          measurementsSnapshot: true,
          notes: true,
          options: { orderBy: { sortOrder: 'asc' }, select: { packageId: true } },
        },
      });
      if (latest.status === 'DRAFT') {
        throw new HttpError(409, 'DRAFT_EXISTS', 'Ya hay una versión en borrador');
      }
      const { measurements } = measurementsSnapshotSchema.parse(latest.measurementsSnapshot);
      const parameters = {
        wasteBps: latest.wasteBps,
        taxBps: latest.taxBps,
        taxAppliesToLabor: latest.taxAppliesToLabor,
        discountBps: latest.discountBps,
        depositBps: latest.depositBps,
      };
      const calculation = await calculateForPackages(
        tx,
        latest.options.map((o) => o.packageId),
        measurements,
        parameters,
      );
      const version = await tx.quoteVersion.create({
        data: {
          quoteId: id,
          versionNumber: latest.versionNumber + 1,
          locale: latest.locale,
          ...parameters,
          measurementsSnapshot: snapshotOf(measurements),
          notes: latest.notes,
          createdById: actor.id,
        },
        select: { id: true },
      });
      await storeOptions(tx, version.id, calculation);
      await audit(tx, req, 'quote.version.create', id, { versionNumber: latest.versionNumber + 1 });
      return version.id;
    });
    res.status(201).json(await readQuoteVersion(id, versionId, context));
  });

  // --- Enviar: bloquea, genera el PDF y congela --------------------------------------------
  router.post('/quotes/:id/versions/:versionId/send', authed, office, async (req, res) => {
    if (!services.storage) {
      throw new HttpError(
        503,
        'STORAGE_NOT_CONFIGURED',
        'El almacenamiento de archivos no está configurado',
      );
    }
    const storage = services.storage;
    const actor = currentUser(req);
    const { id, versionId } = parseInput(versionParams, req.params);
    const input = parseInput(sendSchema, req.body ?? {});
    const context = authContext(req);
    await rlsTransaction(
      db,
      context,
      async (tx) => {
        await draftOr409(tx, context, id, versionId);
        const quote = await tx.quote.findUniqueOrThrow({
          where: { id },
          select: { number: true, firstSentAt: true, customer: true, property: true },
        });
        const version = await tx.quoteVersion.findUniqueOrThrow({
          where: { id: versionId },
          select: { ...versionDetailSelect, validUntil: true },
        });
        if (version.options.length === 0) {
          throw new HttpError(409, 'QUOTE_WITHOUT_OPTIONS', 'La versión no tiene opciones');
        }
        const sentAt = new Date();
        const validUntil =
          input.validUntil ??
          (version.validUntil && version.validUntil > sentAt
            ? version.validUntil
            : new Date(sentAt.getTime() + DEFAULT_VALIDITY_DAYS * 86_400_000));
        const snapshot = measurementsSnapshotSchema.parse(version.measurementsSnapshot);
        const address = [quote.property.addressLine1, quote.property.addressLine2]
          .filter(Boolean)
          .join(', ');
        const pdfData: QuotePdfData = {
          number: quote.number,
          versionNumber: version.versionNumber,
          locale: version.locale === 'en' ? 'en' : 'es',
          sentAt,
          validUntil,
          customerName: `${quote.customer.firstName} ${quote.customer.lastName}`,
          propertyAddress: `${address}, ${quote.property.city}, ${quote.property.state} ${quote.property.zip}`,
          roofSquares: snapshot.roof.squares,
          roofAreaSqFt: snapshot.roof.surfaceAreaSqFt,
          taxBps: version.taxBps,
          taxAppliesToLabor: version.taxAppliesToLabor,
          discountBps: version.discountBps,
          depositBps: version.depositBps,
          notes: version.notes,
          options: version.options.map((o) => ({
            title: o.title,
            tier: o.tier,
            warrantyText: o.warrantyText,
            warrantyYears: o.warrantyYears,
            materialSubtotalCents: o.materialSubtotalCents,
            laborSubtotalCents: o.laborSubtotalCents,
            discountCents: o.discountCents,
            taxCents: o.taxCents,
            totalCents: o.totalCents,
            depositCents: o.depositCents,
            balanceCents: o.balanceCents,
            lines: o.lines.map((l) => ({
              name: l.name,
              kind: l.kind,
              unit: l.unit,
              quantity: l.quantity.toNumber(),
              purchaseQuantity: l.purchaseQuantity.toNumber(),
              purchaseUnitName: l.purchaseUnitName,
              colorName: l.colorName,
              lineTotalCents: l.lineTotalCents,
            })),
          })),
        };
        const pdf = await renderQuotePdf(pdfData);
        const sha256 = createHash('sha256').update(pdf).digest('hex');
        const objectKey = `quotes/${id}/${randomUUID()}.pdf`;
        await storage.put({
          key: objectKey,
          body: pdf,
          contentType: 'application/pdf',
          sha256Hex: sha256,
        });
        const file = await tx.file.create({
          data: {
            bucket: storage.bucket,
            objectKey,
            mimeType: 'application/pdf',
            sizeBytes: BigInt(pdf.length),
            sha256,
            originalName: `${quote.number}-v${version.versionNumber}.pdf`,
            uploadedById: actor.id,
            status: 'READY',
          },
          select: { id: true },
        });
        await tx.quoteVersion.updateMany({
          where: { quoteId: id, status: { in: ['SENT', 'VIEWED'] } },
          data: { status: 'SUPERSEDED', supersededAt: sentAt },
        });
        await tx.quoteVersion.update({
          where: { id: versionId },
          data: {
            status: 'SENT',
            sentAt,
            sentById: actor.id,
            lockedAt: sentAt,
            validUntil,
            pdfFileId: file.id,
            pdfSha256: sha256,
          },
        });
        if (!quote.firstSentAt) {
          await tx.quote.update({ where: { id }, data: { firstSentAt: sentAt } });
        }
        await audit(tx, req, 'quote.send', id, {
          versionId,
          versionNumber: version.versionNumber,
          pdfSha256: sha256,
        });
      },
      { timeout: 30_000 },
    );
    res.json(await readQuoteVersion(id, versionId, context));
  });

  // --- Transiciones del cliente y de la oficina ------------------------------------------------
  router.post(
    '/quotes/:id/versions/:versionId/view',
    authed,
    requireRole('CUSTOMER'),
    async (req, res) => {
      const { id, versionId } = parseInput(versionParams, req.params);
      const context = authContext(req);
      await rlsTransaction(db, context, async (tx) => {
        const version = await versionOr404(tx, context, id, versionId);
        if (version.status === 'VIEWED') return; // idempotente
        if (version.status !== 'SENT') throw invalidTransition(version.status, 'VIEWED');
        const now = new Date();
        await tx.quoteVersion.updateMany({
          where: { id: versionId, status: 'SENT' },
          data: { status: 'VIEWED', viewedAt: now },
        });
        await audit(tx, req, 'quote.view', id, { versionId });
      });
      res.json(await readQuoteVersion(id, versionId, context));
    },
  );

  router.post('/quotes/:id/versions/:versionId/decline', authed, async (req, res) => {
    const { id, versionId } = parseInput(versionParams, req.params);
    const input = parseInput(declineSchema, req.body ?? {});
    const context = authContext(req);
    if (context.role === 'EMPLOYEE') {
      throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción');
    }
    await rlsTransaction(db, context, async (tx) => {
      const version = await versionOr404(tx, context, id, versionId);
      if (version.status !== 'SENT' && version.status !== 'VIEWED') {
        throw invalidTransition(version.status, 'DECLINED');
      }
      await tx.quoteVersion.updateMany({
        where: { id: versionId, status: { in: ['SENT', 'VIEWED'] } },
        data: { status: 'DECLINED', declinedAt: new Date(), declineReason: input.reason ?? null },
      });
      await audit(tx, req, 'quote.decline', id, { versionId });
    });
    res.json(await readQuoteVersion(id, versionId, context));
  });

  // Caducidad manual (la automática queda para después, N14): solo si ya pasó `valid_until`.
  router.post('/quotes/:id/versions/:versionId/expire', authed, office, async (req, res) => {
    const { id, versionId } = parseInput(versionParams, req.params);
    const context = authContext(req);
    await rlsTransaction(db, context, async (tx) => {
      const version = await versionOr404(tx, context, id, versionId);
      if (version.status !== 'SENT' && version.status !== 'VIEWED') {
        throw invalidTransition(version.status, 'EXPIRED');
      }
      if (!version.validUntil || version.validUntil > new Date()) {
        throw new HttpError(409, 'NOT_EXPIRED_YET', 'La versión todavía está vigente');
      }
      await tx.quoteVersion.updateMany({
        where: { id: versionId, status: { in: ['SENT', 'VIEWED'] } },
        data: { status: 'EXPIRED', expiredAt: new Date() },
      });
      await audit(tx, req, 'quote.expire', id, { versionId });
    });
    res.json(await readQuoteVersion(id, versionId, context));
  });

  // --- PDF ------------------------------------------------------------------------------------
  router.get('/quotes/:id/versions/:versionId/pdf', authed, async (req, res) => {
    if (!services.storage) {
      throw new HttpError(
        503,
        'STORAGE_NOT_CONFIGURED',
        'El almacenamiento de archivos no está configurado',
      );
    }
    const { id, versionId } = parseInput(versionParams, req.params);
    const context = authContext(req);
    const file = await rlsTransaction(db, context, async (tx) => {
      const version = visibleOr404(
        await tx.quoteVersion.findFirst({
          where: { AND: [scopes.quoteVersion(context), { id: versionId, quoteId: id }] },
          select: { pdfFile: { select: { objectKey: true, originalName: true, status: true } } },
        }),
      );
      return version.pdfFile;
    });
    if (!file || file.status !== 'READY')
      throw new HttpError(404, 'NOT_FOUND', 'Recurso no encontrado');
    const url = await services.storage.presignDownload({
      key: file.objectKey,
      downloadName: file.originalName ?? undefined,
    });
    res.json({ url, expiresInSeconds: 300 });
  });

  return router;
}
