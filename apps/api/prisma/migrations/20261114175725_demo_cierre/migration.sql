-- Proyectos, facturas y pagos SIMULADOS (modelo de datos §2.7 y §2.8; decisiones N17 y T34).
-- Migración solo aditiva. Partes: (1) números legibles, (2) tablas generadas por Prisma,
-- (3) CHECK, disparadores y RLS. Fuente de (3): prisma/sql/demo-cierre-extras.sql.

CREATE SEQUENCE "project_number_seq";
CREATE FUNCTION "next_project_number"() RETURNS text
  LANGUAGE sql VOLATILE AS $$
  SELECT 'P-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(nextval('project_number_seq')::text, 6, '0')
$$;

CREATE SEQUENCE "invoice_number_seq";
CREATE FUNCTION "next_invoice_number"() RETURNS text
  LANGUAGE sql VOLATILE AS $$
  SELECT 'F-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0')
$$;

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('CREW_LEAD', 'CREW_MEMBER');

-- CreateEnum
CREATE TYPE "PhotoPhase" AS ENUM ('BEFORE', 'DURING', 'AFTER');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('DEPOSIT', 'BALANCE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'VOID');

-- AlterTable
ALTER TABLE "quote_versions" ADD COLUMN     "approved_at" TIMESTAMPTZ(3),
ADD COLUMN     "approved_option_id" UUID;

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL DEFAULT next_project_number(),
    "quote_id" UUID NOT NULL,
    "quote_version_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_start" TIMESTAMPTZ(3),
    "scheduled_end" TIMESTAMPTZ(3),
    "actual_start" TIMESTAMPTZ(3),
    "actual_end" TIMESTAMPTZ(3),
    "contract_total_cents" INTEGER NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_stages" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_assignments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'CREW_MEMBER',
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_photos" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "stage_id" UUID,
    "file_id" UUID NOT NULL,
    "phase" "PhotoPhase" NOT NULL,
    "caption" TEXT,
    "taken_by_id" UUID,
    "taken_at" TIMESTAMPTZ(3),
    "visible_to_customer" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL DEFAULT next_invoice_number(),
    "project_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "total_cents" INTEGER NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "method" TEXT NOT NULL DEFAULT 'Pago simulado',
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_number_key" ON "projects"("number");

-- CreateIndex
CREATE UNIQUE INDEX "projects_quote_version_id_key" ON "projects"("quote_version_id");

-- CreateIndex
CREATE INDEX "projects_customer_id_created_at_idx" ON "projects"("customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "projects_property_id_customer_id_idx" ON "projects"("property_id", "customer_id");

-- CreateIndex
CREATE INDEX "projects_quote_id_idx" ON "projects"("quote_id");

-- CreateIndex
CREATE INDEX "projects_option_id_idx" ON "projects"("option_id");

-- CreateIndex
CREATE INDEX "projects_status_created_at_idx" ON "projects"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "project_stages_project_id_sort_order_key" ON "project_stages"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "project_assignments_employee_id_idx" ON "project_assignments"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_assignments_project_id_employee_id_key" ON "project_assignments"("project_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_photos_file_id_key" ON "project_photos"("file_id");

-- CreateIndex
CREATE INDEX "project_photos_project_id_created_at_idx" ON "project_photos"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "project_photos_stage_id_idx" ON "project_photos"("stage_id");

-- CreateIndex
CREATE INDEX "project_photos_taken_by_id_idx" ON "project_photos"("taken_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_project_id_idx" ON "invoices"("project_id");

-- CreateIndex
CREATE INDEX "invoices_customer_id_issued_at_idx" ON "invoices"("customer_id", "issued_at" DESC);

-- CreateIndex
CREATE INDEX "invoices_status_due_at_idx" ON "invoices"("status", "due_at");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_recorded_by_id_idx" ON "payments"("recorded_by_id");

-- CreateIndex
CREATE INDEX "quote_versions_approved_option_id_idx" ON "quote_versions"("approved_option_id");

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_approved_option_id_fkey" FOREIGN KEY ("approved_option_id") REFERENCES "quote_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_quote_version_id_fkey" FOREIGN KEY ("quote_version_id") REFERENCES "quote_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "quote_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_property_id_customer_id_fkey" FOREIGN KEY ("property_id", "customer_id") REFERENCES "properties"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_taken_by_id_fkey" FOREIGN KEY ("taken_by_id") REFERENCES "employee_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- Parte 3: prisma/sql/demo-cierre-extras.sql ----
-- ---------------------------------------------------------------------------------------
-- Cierre de la demo: aceptación de presupuestos, proyectos, facturas y pagos SIMULADOS.
-- Se anexa a la migración 20261114175725_demo_cierre (el valor APPROVED del enum QuoteStatus
-- va en la migración anterior, porque no se puede usar en la transacción que lo crea).
-- Decisiones N17 y T34. Reglas de RLS: modelo §4.4. Los pagos son solo registros: no hay pasarela.
-- ---------------------------------------------------------------------------------------

-- Presupuestos: aceptación simple (sin firma legal, N15) --------------------------------------
ALTER TABLE "quote_versions"
  ADD CONSTRAINT "quote_versions_approved_chk" CHECK (
    ("status" = 'APPROVED') = ("approved_at" IS NOT NULL AND "approved_option_id" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION "quote_versions_guard"() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  mutable text[] := ARRAY[
    'status', 'viewed_at', 'declined_at', 'decline_reason', 'expired_at', 'superseded_at',
    'approved_at', 'approved_option_id', 'updated_at'
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
    OR (OLD."status" = 'SENT' AND NEW."status" IN ('VIEWED', 'APPROVED', 'DECLINED', 'EXPIRED', 'SUPERSEDED'))
    OR (OLD."status" = 'VIEWED' AND NEW."status" IN ('APPROVED', 'DECLINED', 'EXPIRED', 'SUPERSEDED'))
  ) THEN
    RAISE EXCEPTION 'Transición de estado inválida: % -> %', OLD."status", NEW."status"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- La opción aprobada debe ser de esta versión.
  IF NEW."approved_option_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "quote_options" o WHERE o."id" = NEW."approved_option_id" AND o."version_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'La opción aprobada no pertenece a la versión' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- El cliente pasa su versión enviada a vista, rechazada o aceptada (el disparador valida la transición).
DROP POLICY "customer_respond" ON "quote_versions";
CREATE POLICY customer_respond ON quote_versions FOR UPDATE TO app_user
  USING (
    status IN ('SENT', 'VIEWED')
    AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_versions.quote_id
                AND q.customer_id = (SELECT app.current_customer_id()))
  )
  WITH CHECK (status IN ('VIEWED', 'DECLINED', 'APPROVED'));

-- CHECK: proyectos, facturas y pagos -------------------------------------------------------
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_number_chk" CHECK ("number" ~ '^P-[0-9]{4}-[0-9]{6}$'),
  ADD CONSTRAINT "projects_title_chk" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
  ADD CONSTRAINT "projects_total_chk" CHECK ("contract_total_cents" BETWEEN 0 AND 1000000000),
  ADD CONSTRAINT "projects_dates_chk" CHECK (
    ("scheduled_end" IS NULL OR "scheduled_start" IS NULL OR "scheduled_end" >= "scheduled_start")
    AND ("actual_end" IS NULL OR "actual_start" IS NULL OR "actual_end" >= "actual_start")
  );

ALTER TABLE "project_stages"
  ADD CONSTRAINT "project_stages_name_chk" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100);

ALTER TABLE "project_photos"
  ADD CONSTRAINT "project_photos_caption_chk" CHECK (char_length("caption") <= 300);

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_number_chk" CHECK ("number" ~ '^F-[0-9]{4}-[0-9]{6}$'),
  ADD CONSTRAINT "invoices_total_chk" CHECK ("total_cents" BETWEEN 0 AND 1000000000),
  ADD CONSTRAINT "invoices_paid_chk" CHECK (("status" = 'PAID') = ("paid_at" IS NOT NULL));
-- Una factura activa por tipo (anticipo o saldo) y proyecto.
CREATE UNIQUE INDEX "invoices_project_kind_active_key" ON "invoices"("project_id", "kind")
  WHERE "status" <> 'VOID';

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_chk" CHECK ("amount_cents" > 0),
  -- La demo no cobra nada: todo pago es una simulación (N17).
  ADD CONSTRAINT "payments_simulated_chk" CHECK ("simulated");

-- Seguridad por fila --------------------------------------------------------------------------
-- app_user: la oficina administra todo; el cliente ve sus proyectos, facturas y fotos visibles y
-- crea el proyecto al aceptar su presupuesto; la cuadrilla ve y actualiza solo sus proyectos
-- asignados y no ve facturas ni pagos. app_system no los toca.
GRANT SELECT, INSERT, UPDATE ON projects, project_stages, project_assignments, project_photos,
  invoices TO app_user;
GRANT SELECT, INSERT ON payments TO app_user;
GRANT USAGE ON SEQUENCE project_number_seq, invoice_number_seq TO app_user;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE project_stages ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- Asignaciones: la oficina las gestiona; cada empleado ve las suyas (sin referencias cruzadas
-- con projects, para evitar recursión entre políticas).
CREATE POLICY user_select ON project_assignments FOR SELECT TO app_user USING (
  (SELECT app.is_staff()) OR employee_id = (SELECT app.current_employee_id())
);
CREATE POLICY staff_insert ON project_assignments FOR INSERT TO app_user WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY staff_update ON project_assignments FOR UPDATE TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));

-- Proyectos: oficina todos; el cliente los suyos; la cuadrilla los asignados.
CREATE POLICY user_select ON projects FOR SELECT TO app_user USING (
  (SELECT app.is_staff())
  OR (deleted_at IS NULL AND customer_id = (SELECT app.current_customer_id()))
  OR (deleted_at IS NULL AND EXISTS (
        SELECT 1 FROM project_assignments a
        WHERE a.project_id = projects.id AND a.unassigned_at IS NULL
          AND a.employee_id = (SELECT app.current_employee_id())))
);
-- El cliente crea su proyecto solo al aceptar una versión aprobada de su presupuesto.
CREATE POLICY create_on_accept ON projects FOR INSERT TO app_user WITH CHECK (
  (SELECT app.is_staff())
  OR (customer_id = (SELECT app.current_customer_id())
      AND EXISTS (SELECT 1 FROM quote_versions v WHERE v.id = projects.quote_version_id AND v.status = 'APPROVED'))
);
CREATE POLICY staff_update ON projects FOR UPDATE TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));

-- Etapas: las ve quien ve el proyecto; la oficina o la cuadrilla asignada las actualiza.
CREATE POLICY user_select ON project_stages FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM projects p WHERE p.id = project_stages.project_id)
);
CREATE POLICY create_on_accept ON project_stages FOR INSERT TO app_user WITH CHECK (
  (SELECT app.is_staff())
  OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_stages.project_id
             AND p.customer_id = (SELECT app.current_customer_id()))
);
CREATE POLICY crew_update ON project_stages FOR UPDATE TO app_user
  USING (
    (SELECT app.is_staff())
    OR EXISTS (SELECT 1 FROM project_assignments a
               WHERE a.project_id = project_stages.project_id AND a.unassigned_at IS NULL
                 AND a.employee_id = (SELECT app.current_employee_id()))
  )
  WITH CHECK (
    (SELECT app.is_staff())
    OR EXISTS (SELECT 1 FROM project_assignments a
               WHERE a.project_id = project_stages.project_id AND a.unassigned_at IS NULL
                 AND a.employee_id = (SELECT app.current_employee_id()))
  );

-- Fotos: las ve quien ve el proyecto; el cliente solo las marcadas como visibles.
CREATE POLICY user_select ON project_photos FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM projects p WHERE p.id = project_photos.project_id)
  AND (visible_to_customer OR (SELECT app.current_customer_id()) IS NULL)
);
CREATE POLICY crew_insert ON project_photos FOR INSERT TO app_user WITH CHECK (
  (SELECT app.is_staff())
  OR EXISTS (SELECT 1 FROM project_assignments a
             WHERE a.project_id = project_photos.project_id AND a.unassigned_at IS NULL
               AND a.employee_id = (SELECT app.current_employee_id()))
);
CREATE POLICY staff_update ON project_photos FOR UPDATE TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));

-- Facturas y pagos: oficina todo; el cliente lo suyo; la cuadrilla nada.
CREATE POLICY user_select ON invoices FOR SELECT TO app_user USING (
  (SELECT app.is_staff()) OR customer_id = (SELECT app.current_customer_id())
);
CREATE POLICY create_on_accept ON invoices FOR INSERT TO app_user WITH CHECK (
  (SELECT app.is_staff())
  OR (customer_id = (SELECT app.current_customer_id())
      AND EXISTS (SELECT 1 FROM projects p WHERE p.id = invoices.project_id
                  AND p.customer_id = invoices.customer_id))
);
CREATE POLICY staff_update ON invoices FOR UPDATE TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY user_select ON payments FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM invoices i WHERE i.id = payments.invoice_id)
);
CREATE POLICY staff_insert ON payments FOR INSERT TO app_user WITH CHECK ((SELECT app.is_staff()));

-- Quien ve un proyecto necesita ver a su cliente, su propiedad, su presupuesto y las fotos.
CREATE POLICY projects_select ON customer_profiles FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM projects p WHERE p.customer_id = customer_profiles.id)
);
CREATE POLICY projects_select ON properties FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM projects p WHERE p.property_id = properties.id)
);
CREATE POLICY project_photo_select ON files FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM project_photos ph WHERE ph.file_id = files.id)
);
