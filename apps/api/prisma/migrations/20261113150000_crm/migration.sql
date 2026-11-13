-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'APPOINTMENT_SET', 'INSPECTED', 'QUOTED', 'WON', 'LOST', 'SPAM', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEB_FORM', 'PHONE', 'REFERRAL', 'DOOR_KNOCK', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('INSPECTION', 'FOLLOW_UP', 'ESTIMATE_PRESENTATION');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RoofType" AS ENUM ('ASPHALT_SHINGLE', 'METAL', 'CLAY_TILE', 'CONCRETE_TILE', 'FLAT', 'OTHER');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'READY', 'DELETED');

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "zip" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "year_built" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" "LeadSource" NOT NULL,
    "source_detail" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" CHAR(2),
    "zip" TEXT,
    "message" TEXT,
    "utm" JSONB,
    "spam_reason" TEXT,
    "assigned_to_id" UUID,
    "customer_id" UUID,
    "property_id" UUID,
    "lost_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "lead_id" UUID,
    "assignee_id" UUID NOT NULL,
    "type" "AppointmentType" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancel_reason" TEXT,
    "notes" TEXT,
    "rescheduled_from_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "inspector_id" UUID NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "completed_at" TIMESTAMPTZ(3),
    "roof_type" "RoofType",
    "roof_age_years" INTEGER,
    "findings" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_sections" (
    "id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "area_sqft" DECIMAL(10,2) NOT NULL,
    "pitch_rise" DECIMAL(4,1) NOT NULL,
    "ridge_ft" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "eave_ft" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "hip_ft" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "valley_ft" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "gutter_ft" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inspection_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_photos" (
    "id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "section_id" UUID,
    "file_id" UUID NOT NULL,
    "caption" TEXT,
    "taken_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "original_name" TEXT,
    "uploaded_by_id" UUID,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_customer_id_idx" ON "properties"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_id_customer_id_key" ON "properties"("id", "customer_id");

-- CreateIndex
CREATE INDEX "leads_status_created_at_idx" ON "leads"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_assigned_to_id_status_idx" ON "leads"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "leads_customer_id_idx" ON "leads"("customer_id");

-- CreateIndex
CREATE INDEX "leads_property_id_customer_id_idx" ON "leads"("property_id", "customer_id");

-- CreateIndex
CREATE INDEX "leads_email_created_at_idx" ON "leads"("email", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "appointments_rescheduled_from_id_key" ON "appointments"("rescheduled_from_id");

-- CreateIndex
CREATE INDEX "appointments_assignee_id_starts_at_idx" ON "appointments"("assignee_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_status_starts_at_idx" ON "appointments"("status", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_customer_id_starts_at_idx" ON "appointments"("customer_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_property_id_customer_id_idx" ON "appointments"("property_id", "customer_id");

-- CreateIndex
CREATE INDEX "appointments_lead_id_idx" ON "appointments"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_id_property_id_key" ON "appointments"("id", "property_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_appointment_id_key" ON "inspections"("appointment_id");

-- CreateIndex
CREATE INDEX "inspections_inspector_id_status_idx" ON "inspections"("inspector_id", "status");

-- CreateIndex
CREATE INDEX "inspections_property_id_idx" ON "inspections"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_appointment_id_property_id_key" ON "inspections"("appointment_id", "property_id");

-- CreateIndex
CREATE INDEX "inspection_sections_inspection_id_sort_order_idx" ON "inspection_sections"("inspection_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_photos_file_id_key" ON "inspection_photos"("file_id");

-- CreateIndex
CREATE INDEX "inspection_photos_inspection_id_idx" ON "inspection_photos"("inspection_id");

-- CreateIndex
CREATE INDEX "inspection_photos_section_id_idx" ON "inspection_photos"("section_id");

-- CreateIndex
CREATE INDEX "files_uploaded_by_id_created_at_idx" ON "files"("uploaded_by_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "files_status_created_at_idx" ON "files"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "files_bucket_object_key_key" ON "files"("bucket", "object_key");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_property_id_customer_id_fkey" FOREIGN KEY ("property_id", "customer_id") REFERENCES "properties"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_property_id_customer_id_fkey" FOREIGN KEY ("property_id", "customer_id") REFERENCES "properties"("id", "customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_rescheduled_from_id_fkey" FOREIGN KEY ("rescheduled_from_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_appointment_id_property_id_fkey" FOREIGN KEY ("appointment_id", "property_id") REFERENCES "appointments"("id", "property_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_sections" ADD CONSTRAINT "inspection_sections_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "inspection_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------
-- Reglas del CRM que Prisma no expresa en el esquema (CHECK, EXCLUDE y triggers).
-- Fuente: apps/api/prisma/sql/crm-extras.sql (se anexa a la migración del CRM).
-- ---------------------------------------------------------------------------------------

-- Necesaria para combinar igualdad (assignee_id) y solape de rangos en una sola EXCLUDE.
-- Es una extensión "trusted": la puede crear el dueño de la base sin ser superusuario.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Estados de EE. UU. (50 + DC) en mayúsculas.
CREATE FUNCTION "is_us_state"(code text) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT code IN (
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY',
    'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
    'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  )
$$;

-- Propiedades ----------------------------------------------------------------------------
ALTER TABLE "properties"
  ADD CONSTRAINT "properties_state_chk" CHECK ("is_us_state"("state")),
  ADD CONSTRAINT "properties_zip_chk" CHECK ("zip" ~ '^[0-9]{5}(-[0-9]{4})?$'),
  ADD CONSTRAINT "properties_address_chk" CHECK (
    char_length(btrim("address_line1")) BETWEEN 1 AND 200
    AND char_length(btrim("city")) BETWEEN 1 AND 100
  ),
  ADD CONSTRAINT "properties_year_built_chk" CHECK ("year_built" BETWEEN 1800 AND 2100),
  ADD CONSTRAINT "properties_lat_chk" CHECK ("lat" BETWEEN -90 AND 90),
  ADD CONSTRAINT "properties_lng_chk" CHECK ("lng" BETWEEN -180 AND 180);

-- Leads ----------------------------------------------------------------------------------
ALTER TABLE "leads"
  ADD CONSTRAINT "leads_contact_chk" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL),
  ADD CONSTRAINT "leads_email_lowercase_chk" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "leads_phone_e164_chk" CHECK ("phone" ~ '^\+[1-9][0-9]{6,14}$'),
  ADD CONSTRAINT "leads_state_chk" CHECK ("state" IS NULL OR "is_us_state"("state")),
  ADD CONSTRAINT "leads_zip_chk" CHECK ("zip" ~ '^[0-9]{5}(-[0-9]{4})?$'),
  ADD CONSTRAINT "leads_message_length_chk" CHECK (char_length("message") <= 5000),
  -- LOST exige el motivo (máquina de estados, modelo §3).
  ADD CONSTRAINT "leads_lost_reason_chk" CHECK (
    "status" <> 'LOST' OR ("lost_reason" IS NOT NULL AND btrim("lost_reason") <> '')
  ),
  -- Desde APPOINTMENT_SET el lead ya está convertido en cliente + propiedad.
  ADD CONSTRAINT "leads_converted_chk" CHECK (
    "status" NOT IN ('APPOINTMENT_SET', 'INSPECTED', 'QUOTED', 'WON')
    OR ("customer_id" IS NOT NULL AND "property_id" IS NOT NULL)
  );

-- Citas ----------------------------------------------------------------------------------
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_time_range_chk" CHECK (
    "ends_at" > "starts_at" AND "ends_at" - "starts_at" <= interval '12 hours'
  ),
  ADD CONSTRAINT "appointments_cancel_reason_chk" CHECK (
    "status" <> 'CANCELED' OR ("cancel_reason" IS NOT NULL AND btrim("cancel_reason") <> '')
  ),
  -- Un empleado no puede tener dos citas activas que se solapen (rango semiabierto [inicio, fin):
  -- una cita que empieza justo cuando termina otra no se solapa). Modelo §2.2, decisión T12.
  ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist (
    "assignee_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS') AND "deleted_at" IS NULL);

-- Inspecciones ---------------------------------------------------------------------------
ALTER TABLE "inspections"
  ADD CONSTRAINT "inspections_completed_chk" CHECK (
    ("status" = 'COMPLETED') = ("completed_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "inspections_roof_age_chk" CHECK ("roof_age_years" BETWEEN 0 AND 150);

ALTER TABLE "inspection_sections"
  ADD CONSTRAINT "inspection_sections_name_chk" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
  ADD CONSTRAINT "inspection_sections_area_chk" CHECK ("area_sqft" > 0),
  ADD CONSTRAINT "inspection_sections_pitch_chk" CHECK ("pitch_rise" BETWEEN 0 AND 24),
  ADD CONSTRAINT "inspection_sections_lengths_chk" CHECK (
    "ridge_ft" >= 0 AND "eave_ft" >= 0 AND "hip_ft" >= 0 AND "valley_ft" >= 0 AND "gutter_ft" >= 0
  );

-- La sección de una foto (si la hay) debe ser de la misma inspección.
CREATE FUNCTION "inspection_photos_section_matches"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."section_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "inspection_sections" s
    WHERE s."id" = NEW."section_id" AND s."inspection_id" = NEW."inspection_id"
  ) THEN
    RAISE EXCEPTION 'La sección no pertenece a la inspección de la foto'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "inspection_photos_section_matches"
  BEFORE INSERT OR UPDATE OF "section_id", "inspection_id" ON "inspection_photos"
  FOR EACH ROW EXECUTE FUNCTION "inspection_photos_section_matches"();

-- Archivos -------------------------------------------------------------------------------
ALTER TABLE "files"
  ADD CONSTRAINT "files_sha256_chk" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "files_size_chk" CHECK ("size_bytes" BETWEEN 1 AND 26214400),
  ADD CONSTRAINT "files_mime_chk" CHECK (
    "mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
  ),
  -- Claves generadas por la API ({entidad}/{id}/{uuid}.{ext}): sin rutas absolutas ni "..".
  ADD CONSTRAINT "files_object_key_chk" CHECK (
    "object_key" ~ '^[a-z0-9_-]+(/[A-Za-z0-9_.-]+)+$' AND position('..' IN "object_key") = 0
  ),
  ADD CONSTRAINT "files_deleted_chk" CHECK (("status" = 'DELETED') = ("deleted_at" IS NOT NULL));
