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
