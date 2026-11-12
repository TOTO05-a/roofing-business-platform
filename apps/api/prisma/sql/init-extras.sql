
-- ---------------------------------------------------------------------------------------
-- Reglas que Prisma no expresa en el esquema (CHECK, índices parciales y triggers).
-- Fuente: apps/api/prisma/sql/init-extras.sql (se anexa a la migración inicial).
-- ---------------------------------------------------------------------------------------

-- Correos siempre en minúsculas.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" = lower("email"));
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_email_lowercase_chk" CHECK ("email" = lower("email"));
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_email_lowercase_chk" CHECK ("email" = lower("email"));

-- Teléfonos en formato E.164 (+15551234567).
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_phone_e164_chk" CHECK ("phone" ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_phone_e164_chk" CHECK ("phone" ~ '^\+[1-9][0-9]{6,14}$');

-- Un empleado tiene al menos un tipo de trabajo.
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_job_types_chk" CHECK ("job_types" IS NOT NULL AND cardinality("job_types") >= 1);

-- Un solo cliente activo por correo.
CREATE UNIQUE INDEX "customer_profiles_email_active_key" ON "customer_profiles" (lower("email"))
  WHERE "deleted_at" IS NULL AND "email" IS NOT NULL;

-- Una sola invitación pendiente (sin aceptar ni revocar) por correo.
CREATE UNIQUE INDEX "invitations_email_pending_key" ON "invitations" ("email")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

-- Invitación según el rol:
-- - CUSTOMER: apunta a un CustomerProfile existente.
-- - EMPLOYEE: trae los tipos de trabajo y, ya aceptada, el EmployeeProfile creado.
-- - ADMIN/SUPERADMIN: sin perfil.
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_profile_by_role_chk" CHECK (
  CASE "role"
    WHEN 'CUSTOMER' THEN "customer_id" IS NOT NULL AND "employee_id" IS NULL
      AND coalesce(cardinality("employee_job_types"), 0) = 0
    WHEN 'EMPLOYEE' THEN "customer_id" IS NULL AND coalesce(cardinality("employee_job_types"), 0) >= 1
      AND ("accepted_at" IS NULL OR "employee_id" IS NOT NULL)
    ELSE "customer_id" IS NULL AND "employee_id" IS NULL
      AND coalesce(cardinality("employee_job_types"), 0) = 0
  END
);

-- Auditoría de solo inserción: nadie puede modificar ni borrar entradas (ni siquiera la app).
-- Cuando exista el rol app_user (RLS), además: REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM app_user.
-- Una anonimización legal futura debe hacerse con el rol dueño desactivando este trigger.
CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es de solo inserción (% no permitido)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();

-- TRUNCATE no dispara triggers de fila: se bloquea aparte. Solo las pruebas de integración lo
-- desactivan un instante para vaciar la base desechable (ALTER TABLE … DISABLE TRIGGER).
CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_append_only"();
