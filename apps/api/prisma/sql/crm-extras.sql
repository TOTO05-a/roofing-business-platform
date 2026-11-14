
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
  -- una cita que empieza justo cuando termina otra no se solapa). Modelo §2.2, decisión T27.
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
