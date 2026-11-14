import { Router } from 'express';
import { z } from 'zod';
import { authContext, currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { scopedWhere, visibleOr404 } from '../auth/scope.js';
import { recordAudit, requestMeta } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { rlsTransaction, type RlsTx } from '../lib/rls.js';
import { idParamsSchema, omitUndefined, paginationSchema } from '../lib/schemas.js';
import { parseInput } from '../lib/validation.js';
import type { AppServices } from '../services.js';

/**
 * Catálogo, unidades de compra, colores/texturas y paquetes (modelo §2.4). Solo la oficina
 * (ADMIN y SUPERADMIN) lo ve y lo cambia (P10); lleva precios, que la cuadrilla y ventas no ven.
 * Los cambios de precio nunca afectan a presupuestos ya enviados (P13): las líneas son copias.
 */

const kindSchema = z.enum(['MATERIAL', 'LABOR']);
const unitSchema = z.enum(['SQUARE', 'LINEAR_FT', 'UNIT', 'BUNDLE']);
const tierSchema = z.enum(['BASIC', 'BETTER', 'PREMIUM']);
const ruleSchema = z.enum([
  'PER_SQUARE',
  'PER_LINEAR_FT_RIDGE',
  'PER_LINEAR_FT_EAVE',
  'PER_LINEAR_FT_HIP',
  'PER_LINEAR_FT_VALLEY',
  'PER_LINEAR_FT_GUTTER',
  'FIXED',
]);
const cents = z.number().int().min(0).max(10_000_000);
const name = (max = 200) => z.string().trim().min(1).max(max);
const nonEmpty = (value: object) => Object.keys(value).length > 0;
const NOTHING_TO_CHANGE = 'No hay nada que cambiar';

const categorySchema = z
  .object({
    name: name(100),
    kind: kindSchema,
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();
const categoryPatch = z
  .object({
    name: name(100),
    sortOrder: z.number().int().min(0).max(10_000),
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine(nonEmpty, NOTHING_TO_CHANGE);

const itemFields = {
  sku: z.string().trim().min(1).max(60),
  name: name(),
  description: z.string().trim().max(2000),
  unit: unitSchema,
  materialPriceCents: cents,
  laborPriceCents: cents,
};
const itemSchema = z
  .object({
    categoryId: z.uuid(),
    kind: kindSchema,
    ...itemFields,
    sku: itemFields.sku.optional(),
    description: itemFields.description.optional(),
    laborPriceCents: cents.default(0),
    materialPriceCents: cents.default(0),
  })
  .strict()
  .refine((v) => v.kind === 'MATERIAL' || v.materialPriceCents === 0, {
    message: 'La mano de obra no lleva precio de material',
    path: ['materialPriceCents'],
  });
const itemPatch = z
  .object({
    categoryId: z.uuid(),
    sku: itemFields.sku.nullable(),
    name: itemFields.name,
    description: itemFields.description.nullable(),
    unit: unitSchema,
    materialPriceCents: cents,
    laborPriceCents: cents,
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine(nonEmpty, NOTHING_TO_CHANGE);

const purchaseUnitSchema = z
  .object({
    name: name(100),
    baseUnitsPerPurchaseUnit: z.number().positive().max(1_000_000).multipleOf(0.001),
    isDefault: z.boolean().default(false),
  })
  .strict();
const purchaseUnitPatch = purchaseUnitSchema.partial().strict().refine(nonEmpty, NOTHING_TO_CHANGE);

const materialOptionSchema = z
  .object({
    kind: z.enum(['COLOR', 'TEXTURE']),
    name: name(100),
    hex: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Usa #RRGGBB')
      .optional(),
    visualizerKey: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
const materialOptionPatch = z
  .object({
    name: name(100),
    hex: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable(),
    visualizerKey: z.string().trim().min(1).max(100).nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine(nonEmpty, NOTHING_TO_CHANGE);

const packageLineSchema = z
  .object({
    itemId: z.uuid(),
    quantityRule: ruleSchema,
    factor: z.number().positive().max(10_000).multipleOf(0.0001).optional(),
    defaultMaterialOptionId: z.uuid().optional(),
  })
  .strict()
  .refine((l) => l.quantityRule !== 'FIXED' || l.factor !== undefined, {
    message: 'Una línea de cantidad fija requiere factor',
    path: ['factor'],
  });
const packageFields = {
  tier: tierSchema,
  name: name(),
  description: z.string().trim().max(2000),
  warrantyText: name(500),
  warrantyYears: z.number().int().min(0).max(100),
  sortOrder: z.number().int().min(0).max(10_000),
};
const packageSchema = z
  .object({
    ...packageFields,
    description: packageFields.description.optional(),
    sortOrder: packageFields.sortOrder.default(0),
    lines: z.array(packageLineSchema).min(1).max(200),
  })
  .strict();
const packagePatch = z
  .object({
    ...packageFields,
    description: packageFields.description.nullable(),
    isActive: z.boolean(),
    lines: z.array(packageLineSchema).min(1).max(200),
  })
  .partial()
  .strict()
  .refine(nonEmpty, NOTHING_TO_CHANGE);

const itemListQuery = paginationSchema.extend({
  kind: kindSchema.optional(),
  categoryId: z.uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  includeInactive: z.enum(['true', 'false']).default('false'),
});

const itemInclude = {
  category: { select: { id: true, name: true } },
  purchaseUnits: { orderBy: { name: 'asc' } },
  materialOptions: { orderBy: { name: 'asc' } },
} as const;

function serializeItem<
  T extends { purchaseUnits?: { baseUnitsPerPurchaseUnit: { toNumber(): number } }[] },
>(row: T) {
  return {
    ...row,
    ...(row.purchaseUnits
      ? {
          purchaseUnits: row.purchaseUnits.map((u) => ({
            ...u,
            baseUnitsPerPurchaseUnit: u.baseUnitsPerPurchaseUnit.toNumber(),
          })),
        }
      : {}),
  };
}

const packageInclude = {
  items: {
    orderBy: { sortOrder: 'asc' },
    include: {
      item: { select: { id: true, name: true, kind: true, unit: true } },
      defaultMaterialOption: { select: { id: true, name: true, kind: true, hex: true } },
    },
  },
} as const;

function serializePackage<T extends { items: { factor: { toNumber(): number } | null }[] }>(
  row: T,
) {
  return {
    ...row,
    items: row.items.map((i) => ({ ...i, factor: i.factor ? i.factor.toNumber() : null })),
  };
}

export function catalogRouter(services: AppServices): Router {
  const { db } = services;
  const router = Router();
  const authed = requireAuth(services);
  const office = requireRole('ADMIN', 'SUPERADMIN');
  const guard = [authed, office];

  async function audit(
    tx: RlsTx,
    req: Parameters<typeof requestMeta>[0] & Parameters<typeof currentUser>[0],
    action: string,
    entityType: string,
    entityId: string,
    after?: Record<string, string | number | boolean | null>,
  ) {
    const actor = currentUser(req);
    await recordAudit(tx, {
      actorUserId: actor.id,
      actorEmail: actor.email,
      action,
      entityType,
      entityId,
      ...(after ? { after } : {}),
      ...requestMeta(req),
    });
  }

  // --- Categorías ---------------------------------------------------------------------------
  router.get('/catalog/categories', ...guard, async (req, res) => {
    const context = authContext(req);
    const categories = await rlsTransaction(db, context, (tx) =>
      tx.category.findMany({ orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
    );
    res.json({ categories });
  });

  router.post('/catalog/categories', ...guard, async (req, res) => {
    const input = parseInput(categorySchema, req.body);
    const category = await rlsTransaction(db, authContext(req), async (tx) => {
      const created = await tx.category.create({ data: input });
      await audit(tx, req, 'catalog.category.create', 'category', created.id, {
        name: created.name,
      });
      return created;
    });
    res.status(201).json({ category });
  });

  router.patch('/catalog/categories/:id', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(categoryPatch, req.body);
    const category = await rlsTransaction(db, authContext(req), async (tx) => {
      visibleOr404(await tx.category.findUnique({ where: { id }, select: { id: true } }));
      const updated = await tx.category.update({ where: { id }, data: omitUndefined(input) });
      await audit(tx, req, 'catalog.category.update', 'category', id, {
        fields: Object.keys(input).join(','),
      });
      return updated;
    });
    res.json({ category });
  });

  // --- Artículos ----------------------------------------------------------------------------
  router.get('/catalog/items', ...guard, async (req, res) => {
    const query = parseInput(itemListQuery, req.query);
    const context = authContext(req);
    const where = scopedWhere('catalog', context, {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.includeInactive === 'true' ? {} : { isActive: true }),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { sku: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    });
    const { rows, total } = await rlsTransaction(db, context, async (tx) => ({
      rows: await tx.catalogItem.findMany({
        where,
        include: itemInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      total: await tx.catalogItem.count({ where }),
    }));
    res.json({ items: rows.map(serializeItem), page: query.page, pageSize: query.pageSize, total });
  });

  router.get('/catalog/items/:id', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    const item = await rlsTransaction(db, context, (tx) =>
      tx.catalogItem.findFirst({
        where: scopedWhere('catalog', context, { id }),
        include: itemInclude,
      }),
    );
    res.json({ item: serializeItem(visibleOr404(item)) });
  });

  router.post('/catalog/items', ...guard, async (req, res) => {
    const input = parseInput(itemSchema, req.body);
    const item = await rlsTransaction(db, authContext(req), async (tx) => {
      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new HttpError(404, 'NOT_FOUND', 'Categoría no encontrada');
      if (category.kind !== input.kind) {
        throw new HttpError(409, 'CATEGORY_KIND_MISMATCH', 'La categoría es de otro tipo');
      }
      const created = await tx.catalogItem.create({
        data: omitUndefined(input),
        include: itemInclude,
      });
      await audit(tx, req, 'catalog.item.create', 'catalog_item', created.id, {
        name: created.name,
      });
      return created;
    });
    res.status(201).json({ item: serializeItem(item) });
  });

  router.patch('/catalog/items/:id', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(itemPatch, req.body);
    const context = authContext(req);
    const item = await rlsTransaction(db, context, async (tx) => {
      const current = visibleOr404(
        await tx.catalogItem.findFirst({ where: scopedWhere('catalog', context, { id }) }),
      );
      if (input.categoryId) {
        const category = await tx.category.findUnique({ where: { id: input.categoryId } });
        if (!category) throw new HttpError(404, 'NOT_FOUND', 'Categoría no encontrada');
        if (category.kind !== current.kind) {
          throw new HttpError(409, 'CATEGORY_KIND_MISMATCH', 'La categoría es de otro tipo');
        }
      }
      if (current.kind === 'LABOR' && input.materialPriceCents) {
        throw new HttpError(
          422,
          'LABOR_WITHOUT_MATERIAL_PRICE',
          'La mano de obra no lleva precio de material',
        );
      }
      const updated = await tx.catalogItem.update({
        where: { id },
        data: omitUndefined(input),
        include: itemInclude,
      });
      await audit(tx, req, 'catalog.item.update', 'catalog_item', id, {
        fields: Object.keys(input).join(','),
      });
      return updated;
    });
    res.json({ item: serializeItem(item) });
  });

  // Borrado lógico: el artículo deja de ofrecerse; los presupuestos enviados conservan sus copias.
  router.delete('/catalog/items/:id', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const context = authContext(req);
    await rlsTransaction(db, context, async (tx) => {
      visibleOr404(
        await tx.catalogItem.findFirst({
          where: scopedWhere('catalog', context, { id }),
          select: { id: true },
        }),
      );
      const inPackage = await tx.packageItem.count({
        where: { itemId: id, package: { isActive: true } },
      });
      if (inPackage > 0) {
        throw new HttpError(409, 'ITEM_IN_USE', 'El artículo está en paquetes activos');
      }
      await tx.catalogItem.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      await audit(tx, req, 'catalog.item.delete', 'catalog_item', id);
    });
    res.status(204).end();
  });

  // --- Unidades de compra -------------------------------------------------------------------
  router.post('/catalog/items/:id/purchase-units', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(purchaseUnitSchema, req.body);
    const context = authContext(req);
    const unit = await rlsTransaction(db, context, async (tx) => {
      const item = visibleOr404(
        await tx.catalogItem.findFirst({ where: scopedWhere('catalog', context, { id }) }),
      );
      if (item.kind !== 'MATERIAL') {
        throw new HttpError(409, 'LABOR_WITHOUT_PURCHASE_UNIT', 'La mano de obra no se compra');
      }
      if (input.isDefault) {
        await tx.purchaseUnit.updateMany({ where: { itemId: id }, data: { isDefault: false } });
      }
      const created = await tx.purchaseUnit.create({ data: { ...input, itemId: id } });
      await audit(tx, req, 'catalog.purchase_unit.create', 'purchase_unit', created.id);
      return created;
    });
    res.status(201).json({
      purchaseUnit: { ...unit, baseUnitsPerPurchaseUnit: unit.baseUnitsPerPurchaseUnit.toNumber() },
    });
  });

  router.patch('/catalog/purchase-units/:id', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(purchaseUnitPatch, req.body);
    const unit = await rlsTransaction(db, authContext(req), async (tx) => {
      const current = visibleOr404(await tx.purchaseUnit.findUnique({ where: { id } }));
      if (input.isDefault) {
        await tx.purchaseUnit.updateMany({
          where: { itemId: current.itemId },
          data: { isDefault: false },
        });
      }
      const updated = await tx.purchaseUnit.update({ where: { id }, data: omitUndefined(input) });
      await audit(tx, req, 'catalog.purchase_unit.update', 'purchase_unit', id);
      return updated;
    });
    res.json({
      purchaseUnit: { ...unit, baseUnitsPerPurchaseUnit: unit.baseUnitsPerPurchaseUnit.toNumber() },
    });
  });

  router.delete('/catalog/purchase-units/:id', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    await rlsTransaction(db, authContext(req), async (tx) => {
      visibleOr404(await tx.purchaseUnit.findUnique({ where: { id }, select: { id: true } }));
      await tx.purchaseUnit.delete({ where: { id } });
      await audit(tx, req, 'catalog.purchase_unit.delete', 'purchase_unit', id);
    });
    res.status(204).end();
  });

  // --- Colores y texturas -------------------------------------------------------------------
  router.post('/catalog/items/:id/material-options', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(materialOptionSchema, req.body);
    const context = authContext(req);
    const option = await rlsTransaction(db, context, async (tx) => {
      visibleOr404(
        await tx.catalogItem.findFirst({
          where: scopedWhere('catalog', context, { id }),
          select: { id: true },
        }),
      );
      const created = await tx.materialOption.create({
        data: { ...omitUndefined(input), itemId: id },
      });
      await audit(tx, req, 'catalog.material_option.create', 'material_option', created.id);
      return created;
    });
    res.status(201).json({ materialOption: option });
  });

  router.patch('/catalog/material-options/:id', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const input = parseInput(materialOptionPatch, req.body);
    const option = await rlsTransaction(db, authContext(req), async (tx) => {
      visibleOr404(await tx.materialOption.findUnique({ where: { id }, select: { id: true } }));
      const updated = await tx.materialOption.update({ where: { id }, data: omitUndefined(input) });
      await audit(tx, req, 'catalog.material_option.update', 'material_option', id);
      return updated;
    });
    res.json({ materialOption: option });
  });

  // --- Paquetes -----------------------------------------------------------------------------
  async function checkLines(tx: RlsTx, lines: z.infer<typeof packageLineSchema>[]) {
    const ids = lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) {
      throw new HttpError(422, 'DUPLICATE_ITEM', 'Un artículo aparece dos veces en el paquete');
    }
    const items = await tx.catalogItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    if (items.length !== ids.length)
      throw new HttpError(404, 'NOT_FOUND', 'Algún artículo no existe');
    for (const line of lines) {
      if (line.defaultMaterialOptionId) {
        const option = await tx.materialOption.findFirst({
          where: { id: line.defaultMaterialOptionId, itemId: line.itemId },
          select: { id: true },
        });
        if (!option) throw new HttpError(404, 'NOT_FOUND', 'Opción de material no encontrada');
      }
    }
  }

  const lineData = (line: z.infer<typeof packageLineSchema>, index: number) => ({
    itemId: line.itemId,
    quantityRule: line.quantityRule,
    factor: line.factor ?? null,
    defaultMaterialOptionId: line.defaultMaterialOptionId ?? null,
    sortOrder: index,
  });

  router.get('/catalog/packages', ...guard, async (req, res) => {
    const packages = await rlsTransaction(db, authContext(req), (tx) =>
      tx.package.findMany({
        include: packageInclude,
        orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
    );
    res.json({ packages: packages.map(serializePackage) });
  });

  router.get('/catalog/packages/:id', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const pkg = await rlsTransaction(db, authContext(req), (tx) =>
      tx.package.findUnique({ where: { id }, include: packageInclude }),
    );
    res.json({ package: serializePackage(visibleOr404(pkg)) });
  });

  router.post('/catalog/packages', ...guard, async (req, res) => {
    const { lines, ...input } = parseInput(packageSchema, req.body);
    const pkg = await rlsTransaction(db, authContext(req), async (tx) => {
      await checkLines(tx, lines);
      const created = await tx.package.create({
        data: { ...omitUndefined(input), items: { create: lines.map(lineData) } },
        include: packageInclude,
      });
      await audit(tx, req, 'catalog.package.create', 'package', created.id, { name: created.name });
      return created;
    });
    res.status(201).json({ package: serializePackage(pkg) });
  });

  // Con `lines` se reemplazan todas las líneas del paquete.
  router.patch('/catalog/packages/:id', ...guard, async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
    const { lines, ...input } = parseInput(packagePatch, req.body);
    const pkg = await rlsTransaction(db, authContext(req), async (tx) => {
      visibleOr404(await tx.package.findUnique({ where: { id }, select: { id: true } }));
      if (lines) {
        await checkLines(tx, lines);
        await tx.packageItem.deleteMany({ where: { packageId: id } });
      }
      const updated = await tx.package.update({
        where: { id },
        data: {
          ...omitUndefined(input),
          ...(lines ? { items: { create: lines.map(lineData) } } : {}),
        },
        include: packageInclude,
      });
      await audit(tx, req, 'catalog.package.update', 'package', id, {
        fields: [...Object.keys(input), ...(lines ? ['lines'] : [])].join(','),
      });
      return updated;
    });
    res.json({ package: serializePackage(pkg) });
  });

  return router;
}
