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
