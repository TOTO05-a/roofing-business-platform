-- Catálogo y presupuestos (Etapa 3, modelo de datos §2.4, §2.5 y §3; decisiones N13 y T30).
-- Migración solo aditiva. Tres partes: (1) número legible de presupuesto, (2) tablas generadas por
-- Prisma, (3) CHECK, inmutabilidad (disparadores) y RLS. Fuente de (3):
-- prisma/sql/presupuestos-extras.sql.

-- Número legible Q-AAAA-NNNNNN. Una secuencia global: los huecos son normales (rollbacks).
CREATE SEQUENCE "quote_number_seq";

CREATE FUNCTION "next_quote_number"() RETURNS text
  LANGUAGE sql VOLATILE AS $$
  SELECT 'Q-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(nextval('quote_number_seq')::text, 6, '0')
$$;

-- CreateEnum
CREATE TYPE "CatalogKind" AS ENUM ('MATERIAL', 'LABOR');

-- CreateEnum
CREATE TYPE "CatalogUnit" AS ENUM ('SQUARE', 'LINEAR_FT', 'UNIT', 'BUNDLE');

-- CreateEnum
CREATE TYPE "MaterialOptionKind" AS ENUM ('COLOR', 'TEXTURE');

-- CreateEnum
CREATE TYPE "PackageTier" AS ENUM ('BASIC', 'BETTER', 'PREMIUM');

-- CreateEnum
CREATE TYPE "QuantityRule" AS ENUM ('PER_SQUARE', 'PER_LINEAR_FT_RIDGE', 'PER_LINEAR_FT_EAVE', 'PER_LINEAR_FT_HIP', 'PER_LINEAR_FT_VALLEY', 'PER_LINEAR_FT_GUTTER', 'FIXED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'DECLINED', 'EXPIRED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CatalogKind" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "kind" "CatalogKind" NOT NULL,
    "category_id" UUID NOT NULL,
    "unit" "CatalogUnit" NOT NULL,
    "material_price_cents" INTEGER NOT NULL,
    "labor_price_cents" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_units" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "base_units_per_purchase_unit" DECIMAL(10,3) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_options" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "kind" "MaterialOptionKind" NOT NULL,
    "name" TEXT NOT NULL,
    "hex" CHAR(7),
    "texture_file_id" UUID,
    "visualizer_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "material_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "tier" "PackageTier" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "warranty_text" TEXT NOT NULL,
    "warranty_years" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_items" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity_rule" "QuantityRule" NOT NULL,
    "factor" DECIMAL(10,4),
    "default_material_option_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL DEFAULT next_quote_number(),
    "customer_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "inspection_id" UUID,
    "sales_rep_id" UUID,
    "created_by_id" UUID NOT NULL,
    "first_sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_versions" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "locale" VARCHAR(2) NOT NULL DEFAULT 'es',
    "waste_bps" INTEGER NOT NULL,
    "tax_bps" INTEGER NOT NULL,
    "tax_applies_to_labor" BOOLEAN NOT NULL DEFAULT false,
    "discount_bps" INTEGER NOT NULL DEFAULT 0,
    "deposit_bps" INTEGER NOT NULL,
    "measurements_snapshot" JSONB NOT NULL,
    "notes" TEXT,
    "valid_until" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "sent_by_id" UUID,
    "viewed_at" TIMESTAMPTZ(3),
    "declined_at" TIMESTAMPTZ(3),
    "decline_reason" TEXT,
    "expired_at" TIMESTAMPTZ(3),
    "superseded_at" TIMESTAMPTZ(3),
    "pdf_file_id" UUID,
    "pdf_sha256" CHAR(64),
    "locked_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_options" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "tier" "PackageTier" NOT NULL,
    "title" TEXT NOT NULL,
    "warranty_text" TEXT NOT NULL,
    "warranty_years" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "material_subtotal_cents" INTEGER NOT NULL,
    "labor_subtotal_cents" INTEGER NOT NULL,
    "discount_cents" INTEGER NOT NULL,
    "tax_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "deposit_cents" INTEGER NOT NULL,
    "balance_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "item_id" UUID,
    "material_option_id" UUID,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "kind" "CatalogKind" NOT NULL,
    "unit" "CatalogUnit" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "purchase_unit_name" TEXT,
    "purchase_quantity" DECIMAL(12,3) NOT NULL,
    "unit_material_price_cents" INTEGER NOT NULL,
    "unit_labor_price_cents" INTEGER NOT NULL,
    "line_material_cents" INTEGER NOT NULL,
    "line_labor_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "color_name" TEXT,
    "texture_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_kind_key" ON "categories"("id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_sku_key" ON "catalog_items"("sku");

-- CreateIndex
CREATE INDEX "catalog_items_category_id_kind_idx" ON "catalog_items"("category_id", "kind");

-- CreateIndex
CREATE INDEX "catalog_items_kind_is_active_idx" ON "catalog_items"("kind", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_units_item_id_name_key" ON "purchase_units"("item_id", "name");

-- CreateIndex
CREATE INDEX "material_options_texture_file_id_idx" ON "material_options"("texture_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_options_item_id_kind_name_key" ON "material_options"("item_id", "kind", "name");

-- CreateIndex
CREATE INDEX "packages_tier_is_active_idx" ON "packages"("tier", "is_active");

-- CreateIndex
CREATE INDEX "package_items_item_id_idx" ON "package_items"("item_id");

-- CreateIndex
CREATE INDEX "package_items_default_material_option_id_idx" ON "package_items"("default_material_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "package_items_package_id_item_id_key" ON "package_items"("package_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");

-- CreateIndex
CREATE INDEX "quotes_customer_id_created_at_idx" ON "quotes"("customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "quotes_property_id_customer_id_idx" ON "quotes"("property_id", "customer_id");

-- CreateIndex
CREATE INDEX "quotes_inspection_id_property_id_idx" ON "quotes"("inspection_id", "property_id");

-- CreateIndex
CREATE INDEX "quotes_sales_rep_id_created_at_idx" ON "quotes"("sales_rep_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "quotes_created_by_id_idx" ON "quotes"("created_by_id");

-- CreateIndex
CREATE INDEX "quotes_created_at_id_idx" ON "quotes"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "quote_versions_pdf_file_id_key" ON "quote_versions"("pdf_file_id");

-- CreateIndex
CREATE INDEX "quote_versions_status_sent_at_idx" ON "quote_versions"("status", "sent_at");

-- CreateIndex
CREATE INDEX "quote_versions_status_valid_until_idx" ON "quote_versions"("status", "valid_until");

-- CreateIndex
CREATE INDEX "quote_versions_created_by_id_idx" ON "quote_versions"("created_by_id");

-- CreateIndex
CREATE INDEX "quote_versions_sent_by_id_idx" ON "quote_versions"("sent_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_versions_quote_id_version_number_key" ON "quote_versions"("quote_id", "version_number");

-- CreateIndex
CREATE INDEX "quote_options_package_id_idx" ON "quote_options"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_options_version_id_package_id_key" ON "quote_options"("version_id", "package_id");

-- CreateIndex
CREATE INDEX "quote_lines_item_id_idx" ON "quote_lines"("item_id");

-- CreateIndex
CREATE INDEX "quote_lines_material_option_id_idx" ON "quote_lines"("material_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_lines_option_id_sort_order_key" ON "quote_lines"("option_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_id_property_id_key" ON "inspections"("id", "property_id");

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_id_kind_fkey" FOREIGN KEY ("category_id", "kind") REFERENCES "categories"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_units" ADD CONSTRAINT "purchase_units_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_options" ADD CONSTRAINT "material_options_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_options" ADD CONSTRAINT "material_options_texture_file_id_fkey" FOREIGN KEY ("texture_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_default_material_option_id_fkey" FOREIGN KEY ("default_material_option_id") REFERENCES "material_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_property_id_customer_id_fkey" FOREIGN KEY ("property_id", "customer_id") REFERENCES "properties"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_inspection_id_property_id_fkey" FOREIGN KEY ("inspection_id", "property_id") REFERENCES "inspections"("id", "property_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_pdf_file_id_fkey" FOREIGN KEY ("pdf_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_options" ADD CONSTRAINT "quote_options_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "quote_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_options" ADD CONSTRAINT "quote_options_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "quote_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_material_option_id_fkey" FOREIGN KEY ("material_option_id") REFERENCES "material_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------
-- Catálogo y presupuestos: CHECK, inmutabilidad (disparadores) y RLS (Etapa 3).
-- Se anexa a la migración 20261114120000_presupuestos. Reglas de RLS: modelo §4.4.
--
-- Alcance de la demo (N14): inmutabilidad mínima pero real (versión enviada, sus opciones y sus
-- líneas), sin disparadores para cada columna del catálogo. Ver docs/DECISIONES.md.
-- ---------------------------------------------------------------------------------------

-- CHECK: catálogo ------------------------------------------------------------------------
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_name_chk" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100);

ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_name_chk" CHECK (char_length(btrim("name")) BETWEEN 1 AND 200),
  ADD CONSTRAINT "catalog_items_prices_chk" CHECK (
    "material_price_cents" BETWEEN 0 AND 10000000 AND "labor_price_cents" BETWEEN 0 AND 10000000
  ),
  -- La mano de obra no lleva precio de material (modelo §2.4).
  ADD CONSTRAINT "catalog_items_labor_chk" CHECK ("kind" <> 'LABOR' OR "material_price_cents" = 0);

ALTER TABLE "purchase_units"
  ADD CONSTRAINT "purchase_units_name_chk" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  ADD CONSTRAINT "purchase_units_base_chk" CHECK (
    "base_units_per_purchase_unit" > 0 AND "base_units_per_purchase_unit" <= 1000000
  );
CREATE UNIQUE INDEX "purchase_units_default_key" ON "purchase_units"("item_id") WHERE "is_default";

ALTER TABLE "material_options"
  ADD CONSTRAINT "material_options_name_chk" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  ADD CONSTRAINT "material_options_hex_chk" CHECK ("hex" IS NULL OR "hex" ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE "packages"
  ADD CONSTRAINT "packages_name_chk" CHECK (char_length(btrim("name")) BETWEEN 1 AND 200),
  ADD CONSTRAINT "packages_warranty_chk" CHECK (
    char_length(btrim("warranty_text")) >= 1 AND "warranty_years" BETWEEN 0 AND 100
  );

ALTER TABLE "package_items"
  ADD CONSTRAINT "package_items_factor_chk" CHECK (
    ("factor" IS NULL OR ("factor" > 0 AND "factor" <= 10000))
    AND ("quantity_rule" <> 'FIXED' OR "factor" IS NOT NULL)
  );

-- El color por defecto de una línea de paquete debe ser del mismo artículo.
CREATE FUNCTION "package_items_option_matches"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."default_material_option_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "material_options" m
    WHERE m."id" = NEW."default_material_option_id" AND m."item_id" = NEW."item_id"
  ) THEN
    RAISE EXCEPTION 'La opción de material no pertenece al artículo' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "package_items_option_matches"
  BEFORE INSERT OR UPDATE OF "default_material_option_id", "item_id" ON "package_items"
  FOR EACH ROW EXECUTE FUNCTION "package_items_option_matches"();

-- CHECK: presupuestos --------------------------------------------------------------------
ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_number_chk" CHECK ("number" ~ '^Q-[0-9]{4}-[0-9]{6}$');

ALTER TABLE "quote_versions"
  ADD CONSTRAINT "quote_versions_bps_chk" CHECK (
    "waste_bps" BETWEEN 0 AND 10000 AND "tax_bps" BETWEEN 0 AND 10000
    AND "discount_bps" BETWEEN 0 AND 10000 AND "deposit_bps" BETWEEN 0 AND 10000
  ),
  ADD CONSTRAINT "quote_versions_locale_chk" CHECK ("locale" IN ('es', 'en')),
  ADD CONSTRAINT "quote_versions_number_chk" CHECK ("version_number" >= 1),
  ADD CONSTRAINT "quote_versions_notes_chk" CHECK (char_length("notes") <= 2000),
  -- DRAFT ⇔ sin bloquear; desde SENT hay fecha de envío, PDF y hash (instantánea completa).
  ADD CONSTRAINT "quote_versions_locked_chk" CHECK (("status" = 'DRAFT') = ("locked_at" IS NULL)),
  ADD CONSTRAINT "quote_versions_sent_chk" CHECK (
    "status" = 'DRAFT'
    OR ("sent_at" IS NOT NULL AND "pdf_file_id" IS NOT NULL AND "pdf_sha256" ~ '^[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "quote_versions_declined_chk" CHECK (
    "status" <> 'DECLINED' OR "declined_at" IS NOT NULL
  );
-- Una sola versión en borrador por presupuesto.
CREATE UNIQUE INDEX "quote_versions_one_draft_key" ON "quote_versions"("quote_id") WHERE "status" = 'DRAFT';

ALTER TABLE "quote_options"
  ADD CONSTRAINT "quote_options_amounts_chk" CHECK (
    "material_subtotal_cents" >= 0 AND "labor_subtotal_cents" >= 0 AND "discount_cents" >= 0
    AND "tax_cents" >= 0 AND "total_cents" >= 0 AND "deposit_cents" >= 0 AND "balance_cents" >= 0
  ),
  ADD CONSTRAINT "quote_options_total_chk" CHECK (
    "total_cents" = "material_subtotal_cents" + "labor_subtotal_cents" - "discount_cents" + "tax_cents"
  ),
  ADD CONSTRAINT "quote_options_deposit_chk" CHECK ("deposit_cents" + "balance_cents" = "total_cents");

ALTER TABLE "quote_lines"
  ADD CONSTRAINT "quote_lines_amounts_chk" CHECK (
    "unit_material_price_cents" >= 0 AND "unit_labor_price_cents" >= 0
    AND "line_material_cents" >= 0 AND "line_labor_cents" >= 0 AND "quantity" >= 0
  ),
  ADD CONSTRAINT "quote_lines_total_chk" CHECK ("line_total_cents" = "line_material_cents" + "line_labor_cents");

-- Archivos: los presupuestos guardan su PDF (image/* ya estaba permitido) --------------------
ALTER TABLE "files" DROP CONSTRAINT "files_mime_chk";
ALTER TABLE "files" ADD CONSTRAINT "files_mime_chk" CHECK (
  "mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')
);

-- Inmutabilidad (modelo §2.5 y §4.1) ---------------------------------------------------------
-- Una versión enviada no cambia: solo su estado y las marcas de ese cambio, por transiciones
-- válidas. Rige para TODOS los roles (también el dueño): la garantía vive en la base de datos.
CREATE FUNCTION "quote_versions_guard"() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  mutable text[] := ARRAY[
    'status', 'viewed_at', 'declined_at', 'decline_reason', 'expired_at', 'superseded_at', 'updated_at'
  ];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una versión de presupuesto no se borra' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."locked_at" IS NOT NULL
     AND (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'La versión % ya fue enviada y no se puede modificar', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" = 'SENT')
    OR (OLD."status" = 'SENT' AND NEW."status" IN ('VIEWED', 'DECLINED', 'EXPIRED', 'SUPERSEDED'))
    OR (OLD."status" = 'VIEWED' AND NEW."status" IN ('DECLINED', 'EXPIRED', 'SUPERSEDED'))
  ) THEN
    RAISE EXCEPTION 'Transición de estado inválida: % -> %', OLD."status", NEW."status"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "quote_versions_guard" BEFORE UPDATE OR DELETE ON "quote_versions"
  FOR EACH ROW EXECUTE FUNCTION "quote_versions_guard"();

-- Opciones y líneas de una versión bloqueada: ni se crean, ni se editan, ni se borran.
CREATE FUNCTION "quote_options_guard"() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  version uuid := COALESCE(NEW."version_id", OLD."version_id");
BEGIN
  IF EXISTS (SELECT 1 FROM "quote_versions" v WHERE v."id" = version AND v."locked_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'La versión % está bloqueada: sus opciones no cambian', version
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "quote_options_guard" BEFORE INSERT OR UPDATE OR DELETE ON "quote_options"
  FOR EACH ROW EXECUTE FUNCTION "quote_options_guard"();

CREATE FUNCTION "quote_lines_guard"() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  option uuid := COALESCE(NEW."option_id", OLD."option_id");
BEGIN
  IF EXISTS (
    SELECT 1 FROM "quote_options" o JOIN "quote_versions" v ON v."id" = o."version_id"
    WHERE o."id" = option AND v."locked_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La versión de la opción % está bloqueada: sus líneas no cambian', option
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "quote_lines_guard" BEFORE INSERT OR UPDATE OR DELETE ON "quote_lines"
  FOR EACH ROW EXECUTE FUNCTION "quote_lines_guard"();

-- Seguridad por fila (reglas de modelo-datos.md §4.4) ----------------------------------------
-- app_user: la oficina (ADMIN/SUPERADMIN) administra el catálogo y los presupuestos (P10); ventas
-- lee los precios de SUS presupuestos (P6); la cuadrilla no ve precios; el cliente ve solo sus
-- presupuestos ya enviados y puede marcarlos vistos o rechazarlos. app_system no los toca.
GRANT SELECT, INSERT, UPDATE ON categories, catalog_items, material_options, packages TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_units, package_items TO app_user;
GRANT SELECT, INSERT, UPDATE ON quotes, quote_versions TO app_user;
GRANT SELECT, INSERT, DELETE ON quote_options, quote_lines TO app_user;
GRANT USAGE ON SEQUENCE quote_number_seq TO app_user;

ALTER TABLE categories ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE purchase_units ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE material_options ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE package_items ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE quote_options ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- Catálogo: solo la oficina (tiene precios; la cuadrilla y el cliente no los ven).
CREATE POLICY staff_all ON categories FOR ALL TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY staff_all ON catalog_items FOR ALL TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY staff_all ON purchase_units FOR ALL TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY staff_all ON material_options FOR ALL TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY staff_all ON packages FOR ALL TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY staff_all ON package_items FOR ALL TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));

-- Presupuestos: oficina todo; ventas los suyos; el cliente los suyos ya enviados.
CREATE POLICY user_select ON quotes FOR SELECT TO app_user USING (
  (SELECT app.is_staff())
  OR (sales_rep_id IS NOT NULL AND sales_rep_id = (SELECT app.current_employee_id()) AND deleted_at IS NULL)
  OR (customer_id = (SELECT app.current_customer_id()) AND first_sent_at IS NOT NULL AND deleted_at IS NULL)
);
CREATE POLICY staff_insert ON quotes FOR INSERT TO app_user WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY staff_update ON quotes FOR UPDATE TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));

-- Versiones: quien ve el presupuesto ve sus versiones enviadas; los borradores, solo la oficina.
CREATE POLICY user_select ON quote_versions FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_versions.quote_id)
  AND ((SELECT app.is_staff()) OR status <> 'DRAFT')
);
CREATE POLICY staff_insert ON quote_versions FOR INSERT TO app_user WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY staff_update ON quote_versions FOR UPDATE TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));
-- El cliente solo pasa su versión enviada a vista o rechazada (el disparador valida la transición).
CREATE POLICY customer_respond ON quote_versions FOR UPDATE TO app_user
  USING (
    status IN ('SENT', 'VIEWED')
    AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_versions.quote_id
                AND q.customer_id = (SELECT app.current_customer_id()))
  )
  WITH CHECK (status IN ('VIEWED', 'DECLINED'));

-- Opciones y líneas: visibles si lo es su versión; solo la oficina las escribe.
CREATE POLICY user_select ON quote_options FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM quote_versions v WHERE v.id = quote_options.version_id)
);
CREATE POLICY staff_insert ON quote_options FOR INSERT TO app_user WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY staff_delete ON quote_options FOR DELETE TO app_user USING ((SELECT app.is_staff()));
CREATE POLICY user_select ON quote_lines FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM quote_options o WHERE o.id = quote_lines.option_id)
);
CREATE POLICY staff_insert ON quote_lines FOR INSERT TO app_user WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY staff_delete ON quote_lines FOR DELETE TO app_user USING ((SELECT app.is_staff()));

-- Quien ve un presupuesto necesita ver a su cliente, su propiedad y su PDF (ventas incluido).
CREATE POLICY quotes_select ON customer_profiles FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM quotes q WHERE q.customer_id = customer_profiles.id)
);
CREATE POLICY quotes_select ON properties FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM quotes q WHERE q.property_id = properties.id)
);
CREATE POLICY quote_pdf_select ON files FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM quote_versions v WHERE v.pdf_file_id = files.id)
);
