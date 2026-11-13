-- ---------------------------------------------------------------------------------------
-- Seguridad por fila (RLS), modelo de datos §4.4 y decisión T25.
-- Fuente: apps/api/prisma/sql/rls.sql (migración propia, solo aditiva).
--
-- Roles de base de datos (sin LOGIN aquí: la contraseña la pone cada entorno, ver
-- apps/api/README del modelo y prisma/setup-db-roles.ts):
--   - El dueño de las tablas (quien migra) NO lo usa la API.
--   - app_user: la API en nombre de una persona autenticada. Contexto por transacción con
--     set_config('app.*', ..., true) (extensión del cliente Prisma, src/lib/rls.ts).
--   - app_system: Better Auth, aceptación de invitaciones, límite de intentos de login y el
--     formulario público. Políticas explícitas por tabla; no ve el CRM salvo los leads web
--     recientes (para el límite por correo).
-- Ninguno es superusuario, tiene BYPASSRLS ni es dueño de las tablas.
--
-- Al añadir una tabla: GRANT explícito a cada rol, ENABLE + FORCE RLS, políticas y su caso en
-- test/integration/rls.test.ts (una prueba falla si una tabla de public no tiene RLS forzada).
-- ---------------------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_system') THEN
    CREATE ROLE app_system NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  -- Los roles son del clúster: si ya existían, se comprueba que no saltan la RLS.
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('app_user', 'app_system') AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'app_user y app_system no pueden ser superusuarios ni tener BYPASSRLS';
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user, app_system', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO app_user, app_system;

-- Esquema privado con las funciones auxiliares ------------------------------------------
-- Leen el contexto que la API fija en cada transacción (is_local = true, así funciona con el
-- pooler de Neon en modo transacción). Sin contexto devuelven NULL y las políticas no dejan
-- ver nada (falla en cerrado). STABLE + SECURITY INVOKER; las políticas las llaman como
-- (SELECT app.f()) para que se evalúen una vez por consulta.
CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO app_user;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- "current_role" es palabra reservada de SQL: de ahí el nombre.
CREATE OR REPLACE FUNCTION app.current_app_role() RETURNS text
  LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.role', true), '')
$$;

CREATE OR REPLACE FUNCTION app.current_customer_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE AS $$
  SELECT CASE WHEN app.current_app_role() = 'CUSTOMER'
    THEN nullif(current_setting('app.customer_id', true), '')::uuid END
$$;

CREATE OR REPLACE FUNCTION app.current_employee_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE AS $$
  SELECT CASE WHEN app.current_app_role() IN ('EMPLOYEE', 'ADMIN', 'SUPERADMIN')
    THEN nullif(current_setting('app.employee_id', true), '')::uuid END
$$;

CREATE OR REPLACE FUNCTION app.is_staff() RETURNS boolean
  LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE AS $$
  SELECT coalesce(app.current_app_role() IN ('ADMIN', 'SUPERADMIN'), false)
$$;

CREATE OR REPLACE FUNCTION app.is_superadmin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE AS $$
  SELECT coalesce(app.current_app_role() = 'SUPERADMIN', false)
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user;

-- Permisos de tabla (lo que no aparece aquí, no se puede) -------------------------------
-- app_user: nunca lee contraseñas, secretos TOTP, tokens de sesión ni verificaciones.
GRANT SELECT, UPDATE (role, status, updated_at) ON users TO app_user;
GRANT SELECT (id, user_id, expires_at, created_at, updated_at), DELETE ON sessions TO app_user;
GRANT SELECT, INSERT, UPDATE (revoked_at) ON invitations TO app_user;
-- Auditoría: solo inserción y lectura (append-only también por trigger).
GRANT SELECT, INSERT ON audit_logs TO app_user;
GRANT SELECT, INSERT, UPDATE ON customer_profiles TO app_user;
GRANT SELECT ON employee_profiles TO app_user;
GRANT SELECT, INSERT, UPDATE ON properties, leads, appointments, inspections TO app_user;
-- Archivos: bucket y clave no cambian nunca (si no, la descarga firmaría cualquier objeto).
GRANT SELECT, INSERT, UPDATE (status, deleted_at, updated_at) ON files TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_sections, inspection_photos TO app_user;

-- app_system: lo que necesitan Better Auth, las invitaciones y el formulario público.
GRANT SELECT, INSERT, UPDATE ON users TO app_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, accounts, verifications, two_factors, login_throttles TO app_system;
GRANT SELECT, UPDATE (accepted_at, accepted_user_id, employee_id) ON invitations TO app_system;
GRANT SELECT, UPDATE (user_id, email, updated_at) ON customer_profiles TO app_system;
GRANT SELECT, INSERT ON employee_profiles TO app_system;
GRANT INSERT ON audit_logs TO app_system;
GRANT SELECT, INSERT ON leads TO app_system;

-- ENABLE + FORCE en todas las tablas con datos de personas y del CRM --------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE two_factors ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE login_throttles ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE employee_profiles ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE inspection_sections ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- Políticas de app_system ---------------------------------------------------------------
CREATE POLICY system_all ON users TO app_system USING (true) WITH CHECK (true);
CREATE POLICY system_all ON sessions TO app_system USING (true) WITH CHECK (true);
CREATE POLICY system_all ON accounts TO app_system USING (true) WITH CHECK (true);
CREATE POLICY system_all ON verifications TO app_system USING (true) WITH CHECK (true);
CREATE POLICY system_all ON two_factors TO app_system USING (true) WITH CHECK (true);
CREATE POLICY system_all ON login_throttles TO app_system USING (true) WITH CHECK (true);
CREATE POLICY system_select ON invitations FOR SELECT TO app_system USING (true);
CREATE POLICY system_accept ON invitations FOR UPDATE TO app_system
  USING (accepted_at IS NULL AND revoked_at IS NULL) WITH CHECK (true);
CREATE POLICY system_select ON customer_profiles FOR SELECT TO app_system USING (true);
CREATE POLICY system_link ON customer_profiles FOR UPDATE TO app_system
  USING (deleted_at IS NULL) WITH CHECK (deleted_at IS NULL);
CREATE POLICY system_select ON employee_profiles FOR SELECT TO app_system USING (true);
CREATE POLICY system_insert ON employee_profiles FOR INSERT TO app_system WITH CHECK (true);
CREATE POLICY system_insert ON audit_logs FOR INSERT TO app_system WITH CHECK (true);
-- Formulario público: solo crea leads WEB_FORM sin asignar ni convertir, y solo ve los de las
-- últimas 24 h (límite de envíos por correo; también lo exige el RETURNING del INSERT).
CREATE POLICY system_web_form_insert ON leads FOR INSERT TO app_system WITH CHECK (
  source = 'WEB_FORM' AND status IN ('NEW', 'SPAM') AND assigned_to_id IS NULL
  AND customer_id IS NULL AND property_id IS NULL AND deleted_at IS NULL
);
CREATE POLICY system_web_form_select ON leads FOR SELECT TO app_system USING (
  source = 'WEB_FORM' AND created_at > now() - interval '24 hours'
);

-- Políticas de app_user -----------------------------------------------------------------
-- Cuentas: cada persona ve la suya; la oficina, todas; solo SUPERADMIN cambia rol o estado.
CREATE POLICY user_select ON users FOR SELECT TO app_user
  USING (id = (SELECT app.current_user_id()) OR (SELECT app.is_staff()));
CREATE POLICY user_update ON users FOR UPDATE TO app_user
  USING ((SELECT app.is_superadmin())) WITH CHECK ((SELECT app.is_superadmin()));

-- Sesiones: SUPERADMIN las cierra al desactivar una cuenta o cambiarle el rol.
CREATE POLICY user_select ON sessions FOR SELECT TO app_user USING ((SELECT app.is_superadmin()));
CREATE POLICY user_delete ON sessions FOR DELETE TO app_user USING ((SELECT app.is_superadmin()));

-- Invitaciones: solo SUPERADMIN (decisión del 12-11-2026), firmadas con su propio id.
CREATE POLICY user_select ON invitations FOR SELECT TO app_user USING ((SELECT app.is_superadmin()));
CREATE POLICY user_insert ON invitations FOR INSERT TO app_user WITH CHECK (
  (SELECT app.is_superadmin()) AND invited_by_id = (SELECT app.current_user_id())
);
CREATE POLICY user_update ON invitations FOR UPDATE TO app_user
  USING ((SELECT app.is_superadmin())) WITH CHECK ((SELECT app.is_superadmin()));

-- Auditoría: cualquiera con contexto inserta a su nombre; solo la oficina lee.
CREATE POLICY user_insert ON audit_logs FOR INSERT TO app_user
  WITH CHECK (actor_user_id = (SELECT app.current_user_id()));
CREATE POLICY user_select ON audit_logs FOR SELECT TO app_user USING ((SELECT app.is_staff()));

-- Clientes: la oficina todo; el cliente, su perfil; el empleado, los de sus citas y leads.
CREATE POLICY user_select ON customer_profiles FOR SELECT TO app_user USING (
  (SELECT app.is_staff())
  OR id = (SELECT app.current_customer_id())
  OR EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.customer_id = customer_profiles.id AND a.assignee_id = (SELECT app.current_employee_id())
  )
  OR EXISTS (
    SELECT 1 FROM leads l
    WHERE l.customer_id = customer_profiles.id AND l.assigned_to_id = (SELECT app.current_employee_id())
  )
);
CREATE POLICY user_insert ON customer_profiles FOR INSERT TO app_user WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY user_update ON customer_profiles FOR UPDATE TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));

-- Empleados: la oficina todos; cada empleado, el suyo.
CREATE POLICY user_select ON employee_profiles FOR SELECT TO app_user USING (
  (SELECT app.is_staff()) OR id = (SELECT app.current_employee_id())
);

-- Propiedades: como los clientes.
CREATE POLICY user_select ON properties FOR SELECT TO app_user USING (
  (SELECT app.is_staff())
  OR customer_id = (SELECT app.current_customer_id())
  OR EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.property_id = properties.id AND a.assignee_id = (SELECT app.current_employee_id())
  )
  OR EXISTS (
    SELECT 1 FROM leads l
    WHERE l.property_id = properties.id AND l.assigned_to_id = (SELECT app.current_employee_id())
  )
);
CREATE POLICY user_insert ON properties FOR INSERT TO app_user WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY user_update ON properties FOR UPDATE TO app_user
  USING ((SELECT app.is_staff())) WITH CHECK ((SELECT app.is_staff()));

-- Leads: la oficina todo; el empleado asignado ve y actualiza los suyos (sin reasignarlos).
-- El cliente no ve leads.
CREATE POLICY user_select ON leads FOR SELECT TO app_user USING (
  (SELECT app.is_staff()) OR assigned_to_id = (SELECT app.current_employee_id())
);
CREATE POLICY user_insert ON leads FOR INSERT TO app_user WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY user_update ON leads FOR UPDATE TO app_user
  USING ((SELECT app.is_staff()) OR assigned_to_id = (SELECT app.current_employee_id()))
  WITH CHECK ((SELECT app.is_staff()) OR assigned_to_id = (SELECT app.current_employee_id()));

-- Citas: la oficina todo; el empleado las suyas (cambia su estado, no la reasigna); el cliente
-- las suyas, solo lectura.
CREATE POLICY user_select ON appointments FOR SELECT TO app_user USING (
  (SELECT app.is_staff())
  OR assignee_id = (SELECT app.current_employee_id())
  OR customer_id = (SELECT app.current_customer_id())
);
CREATE POLICY user_insert ON appointments FOR INSERT TO app_user WITH CHECK ((SELECT app.is_staff()));
CREATE POLICY user_update ON appointments FOR UPDATE TO app_user
  USING ((SELECT app.is_staff()) OR assignee_id = (SELECT app.current_employee_id()))
  WITH CHECK ((SELECT app.is_staff()) OR assignee_id = (SELECT app.current_employee_id()));

-- Inspecciones (internas: el cliente no las ve, modelo §4.4). El inspector edita la suya
-- mientras está en borrador; la crea solo para una cita que tiene asignada.
CREATE POLICY user_select ON inspections FOR SELECT TO app_user USING (
  (SELECT app.is_staff())
  OR inspector_id = (SELECT app.current_employee_id())
  OR EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.id = inspections.appointment_id AND a.assignee_id = (SELECT app.current_employee_id())
  )
);
CREATE POLICY user_insert ON inspections FOR INSERT TO app_user WITH CHECK (
  (SELECT app.is_staff())
  OR (
    inspector_id = (SELECT app.current_employee_id())
    AND EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = inspections.appointment_id AND a.assignee_id = (SELECT app.current_employee_id())
    )
  )
);
CREATE POLICY user_update ON inspections FOR UPDATE TO app_user
  USING (
    (SELECT app.is_staff())
    OR (inspector_id = (SELECT app.current_employee_id()) AND status = 'DRAFT')
  )
  WITH CHECK ((SELECT app.is_staff()) OR inspector_id = (SELECT app.current_employee_id()));

-- Secciones y fotos: visibles si la inspección es visible (su RLS se aplica en el EXISTS);
-- se editan si eres oficina o el inspector de una inspección en borrador.
CREATE POLICY user_select ON inspection_sections FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_sections.inspection_id)
);
CREATE POLICY user_write ON inspection_sections FOR ALL TO app_user
  USING (
    (SELECT app.is_staff())
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_sections.inspection_id
        AND i.inspector_id = (SELECT app.current_employee_id()) AND i.status = 'DRAFT'
    )
  )
  WITH CHECK (
    (SELECT app.is_staff())
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_sections.inspection_id
        AND i.inspector_id = (SELECT app.current_employee_id()) AND i.status = 'DRAFT'
    )
  );

CREATE POLICY user_select ON inspection_photos FOR SELECT TO app_user USING (
  EXISTS (SELECT 1 FROM inspections i WHERE i.id = inspection_photos.inspection_id)
);
CREATE POLICY user_write ON inspection_photos FOR ALL TO app_user
  USING (
    (SELECT app.is_staff())
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_photos.inspection_id
        AND i.inspector_id = (SELECT app.current_employee_id()) AND i.status = 'DRAFT'
    )
  )
  WITH CHECK (
    (SELECT app.is_staff())
    OR EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_photos.inspection_id
        AND i.inspector_id = (SELECT app.current_employee_id()) AND i.status = 'DRAFT'
    )
  );

-- Archivos: la oficina todos; quien lo subió; y quien ve la foto de inspección que lo usa.
-- Suben la oficina y los empleados, siempre a su nombre.
CREATE POLICY user_select ON files FOR SELECT TO app_user USING (
  (SELECT app.is_staff())
  OR uploaded_by_id = (SELECT app.current_user_id())
  OR EXISTS (SELECT 1 FROM inspection_photos p WHERE p.file_id = files.id)
);
CREATE POLICY user_insert ON files FOR INSERT TO app_user WITH CHECK (
  ((SELECT app.is_staff()) OR (SELECT app.current_employee_id()) IS NOT NULL)
  AND uploaded_by_id = (SELECT app.current_user_id())
);
CREATE POLICY user_update ON files FOR UPDATE TO app_user
  USING ((SELECT app.is_staff()) OR uploaded_by_id = (SELECT app.current_user_id()))
  WITH CHECK ((SELECT app.is_staff()) OR uploaded_by_id = (SELECT app.current_user_id()));

-- Columnas de enlace que solo cambia la oficina ----------------------------------------
-- Las políticas dan visibilidad según estas columnas (cliente, propiedad, cita, asignado):
-- si un empleado pudiera cambiarlas en sus filas, «adoptaría» clientes ajenos. Un GRANT por
-- columna no sirve porque oficina y empleados comparten el rol app_user; de ahí el trigger.
-- Solo actúa sobre app_user: el dueño (migraciones, seed) y app_system no pasan por aquí.
CREATE OR REPLACE FUNCTION app.guard_staff_only_columns() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  col text;
BEGIN
  IF current_user = 'app_user' AND NOT app.is_staff() THEN
    FOREACH col IN ARRAY TG_ARGV LOOP
      IF to_jsonb(NEW) -> col IS DISTINCT FROM to_jsonb(OLD) -> col THEN
        RAISE EXCEPTION 'Solo la oficina puede cambiar %.%', TG_TABLE_NAME, col
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.guard_staff_only_columns() FROM PUBLIC;

CREATE TRIGGER leads_staff_only_columns BEFORE UPDATE ON leads FOR EACH ROW
  EXECUTE FUNCTION app.guard_staff_only_columns('customer_id', 'property_id', 'assigned_to_id', 'source');
CREATE TRIGGER appointments_staff_only_columns BEFORE UPDATE ON appointments FOR EACH ROW
  EXECUTE FUNCTION app.guard_staff_only_columns(
    'customer_id', 'property_id', 'lead_id', 'assignee_id', 'starts_at', 'ends_at', 'rescheduled_from_id'
  );
CREATE TRIGGER inspections_staff_only_columns BEFORE UPDATE ON inspections FOR EACH ROW
  EXECUTE FUNCTION app.guard_staff_only_columns('appointment_id', 'property_id', 'inspector_id');

-- Al enlazar una foto, el archivo debe ser de quien lo enlaza (o de la oficina): enlazar el
-- archivo de otra persona lo haría visible a través de la foto. Va en un trigger y no en el
-- WITH CHECK porque la política de files ya consulta inspection_photos (sería recursiva).
CREATE OR REPLACE FUNCTION app.guard_photo_file_owner() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF current_user = 'app_user' AND NOT app.is_staff() AND NOT EXISTS (
    SELECT 1 FROM files f
    WHERE f.id = NEW.file_id AND f.uploaded_by_id = app.current_user_id()
  ) THEN
    RAISE EXCEPTION 'Solo puedes enlazar archivos que subiste tú'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.guard_photo_file_owner() FROM PUBLIC;

CREATE TRIGGER inspection_photos_file_owner BEFORE INSERT OR UPDATE OF file_id ON inspection_photos
  FOR EACH ROW EXECUTE FUNCTION app.guard_photo_file_owner();
