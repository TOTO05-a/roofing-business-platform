# Credenciales de la demo

Usuarios **ficticios** para probar la plataforma en tu computadora. Las contraseñas son **valores de prueba locales**: salen de `apps/api/.env.example` y las escribe `pnpm demo` en tu `apps/api/.env` (que no se sube a Git). No sirven en ningún entorno real y nunca deben usarse para cuentas de verdad.

Entrar en: **http://localhost:5173** (primero arranca todo con [`COMO-INICIAR.md`](COMO-INICIAR.md)).

| Rol                | Correo                                 | Contraseña de prueba   | Variable que la define        | Qué puede hacer                                                                                                     |
| ------------------ | -------------------------------------- | ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Superadministrador | `superadmin@cresta-roofing.example`    | `Demo-Superadmin-2026` | `SEED_SUPERADMIN_PASSWORD`    | Todo, incluidos usuarios, roles, catálogo y ajustes sensibles                                                       |
| Administrador      | `administrador@cresta-roofing.example` | `Demo-Admin-2026!`     | `SEED_DEMO_ADMIN_PASSWORD`    | Oficina: leads, clientes, propiedades, citas e inspecciones (y catálogo y presupuestos cuando esa etapa se fusione) |
| Empleado           | `empleado@cresta-roofing.example`      | `Demo-Empleado-2026`   | `SEED_DEMO_EMPLOYEE_PASSWORD` | Ventas e inspección: solo sus leads, citas e inspecciones asignadas                                                 |
| Cliente            | `cliente@cresta-roofing.example`       | `Demo-Cliente-2026`    | `SEED_DEMO_CUSTOMER_PASSWORD` | Su portal: sus propiedades, citas y presupuestos enviados                                                           |

Si cambias una contraseña en `apps/api/.env` **después** de sembrar, no se actualiza: el seed nunca modifica usuarios existentes. Para volver a sembrar desde cero, `docker compose down -v` y `pnpm demo`.

## Verificación en dos pasos (admin y superadmin)

Por seguridad, el administrador y el superadministrador **deben activar la verificación en dos pasos (2FA)** la primera vez que entran. La demo no la desactiva.

1. Entra con el correo y la contraseña de la tabla, y vuelve a escribir la contraseña cuando la app lo pida para empezar la activación.
2. La app muestra un **código QR**. Escanéalo con una app de autenticación (Google Authenticator, Microsoft Authenticator, 2FAS, Aegis...). Si no puedes escanear, copia el **secreto** que aparece debajo en esa app.
3. Escribe el código de 6 dígitos que muestra la app y guarda los **códigos de respaldo**.
4. Las siguientes veces, tras la contraseña te pedirá el código de 6 dígitos.

Si pierdes el acceso al 2FA en local, lo más rápido es empezar de cero: `docker compose down -v` y `pnpm demo` (se pierden los datos locales).

## Otros accesos locales

| Servicio                                                           | Dónde                 | Acceso                                                         |
| ------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------- |
| Correos de prueba (Mailpit)                                        | http://localhost:8025 | Sin contraseña                                                 |
| pgAdmin (opcional, `docker compose --profile tools up -d pgadmin`) | http://localhost:5050 | `dev@example.com` / `pgadmin_dev_password` (de `.env.example`) |
| PostgreSQL                                                         | `localhost:5432`      | `roofing` / `roofing_dev_password` (de `.env.example`)         |

Todos estos valores son de desarrollo local y están publicados a propósito en los `.env.example`; no protegen nada real.
