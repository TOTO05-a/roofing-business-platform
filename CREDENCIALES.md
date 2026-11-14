# Credenciales de la demo

Usuarios **ficticios** para probar la plataforma en tu computadora. Todo es una **simulación**: los datos son inventados, los pagos son registros de demostración (no se cobra nada) y la aceptación de presupuestos no lleva firma legal. Las contraseñas son **valores de prueba locales**: salen de `apps/api/.env.example` y las escribe `pnpm demo` en tu `apps/api/.env` (que no se sube a Git). No sirven en ningún entorno real y nunca deben usarse para cuentas de verdad.

Entrar en: **http://localhost:5173** (primero arranca todo con [`COMO-INICIAR.md`](COMO-INICIAR.md)).

## Los 4 usuarios

| Rol                | Correo                                 | Contraseña de prueba   | Variable que la define        |
| ------------------ | -------------------------------------- | ---------------------- | ----------------------------- |
| Superadministrador | `superadmin@cresta-roofing.example`    | `Demo-Superadmin-2026` | `SEED_SUPERADMIN_PASSWORD`    |
| Administrador      | `administrador@cresta-roofing.example` | `Demo-Admin-2026!`     | `SEED_DEMO_ADMIN_PASSWORD`    |
| Empleado           | `empleado@cresta-roofing.example`      | `Demo-Empleado-2026`   | `SEED_DEMO_EMPLOYEE_PASSWORD` |
| Cliente            | `cliente@cresta-roofing.example`       | `Demo-Cliente-2026`    | `SEED_DEMO_CUSTOMER_PASSWORD` |

Si cambias una contraseña en `apps/api/.env` **después** de sembrar, no se actualiza: el seed nunca modifica usuarios existentes. Para volver a sembrar desde cero, `docker compose down -v` y `pnpm demo`.

## Qué ve cada rol

| Rol                | Qué ve y qué puede probar                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Superadministrador | Todo lo del administrador y además **Usuarios y roles** (lista de cuentas con su rol y su 2FA).                                                                                                                                                                                                                                                                                  |
| Administrador      | **Inicio** con cifras (leads nuevos, citas de la semana, presupuestos enviados y aceptados, proyectos en curso, cobrado y pendiente), leads, clientes, propiedades, agenda, inspecciones, **catálogo** (artículos y paquetes), **presupuestos** (crear, enviar con PDF), **proyectos** (etapas, cuadrilla, fotos), **facturas** (botón «Registrar pago (simulado)») y empleados. |
| Empleado           | Solo lo suyo: sus leads, citas e inspecciones asignadas, los presupuestos que vende (solo lectura) y los **proyectos en los que está asignado**, donde avanza las etapas.                                                                                                                                                                                                        |
| Cliente            | Su portal: sus propiedades, citas, **presupuestos** enviados (con su PDF), **proyectos** (etapas y fotos) y **facturas**. Puede **«Aceptar»** un presupuesto enviado (aceptación simple de demostración, sin firma legal): se crea su proyecto y sus facturas simuladas.                                                                                                         |

Para probar la aceptación entra como **Cliente** → Presupuestos → el presupuesto «Visto» → «Aceptar esta opción».

## Verificación en dos pasos (2FA) del administrador y el superadministrador

Por seguridad, estos dos usuarios piden un código de 6 dígitos al entrar. **En la demo local ya vienen con el 2FA activado**, con un secreto fijo y público, así que **no hace falta escanear ningún QR**. (Esto solo existe con `SEED_DEMO=true` en tu computadora; los usuarios reales siguen activando su propio 2FA como siempre.)

**Cómo entrar:**

1. Escribe el correo y la contraseña de la tabla.
2. La app pide el «Código de verificación». En otra terminal ejecuta:

   ```bash
   pnpm demo:codigo
   ```

   Imprime el código de 6 dígitos de ese momento (vale unos 30 segundos; si caduca, ejecútalo otra vez). Escríbelo en la app.

**Datos fijos de la demo** (por si prefieres usar una app de autenticación o un código de respaldo):

| Dato                              | Valor                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| Secreto TOTP (base32, 6 dígitos)  | `CRESTAROOFINGDEMOTWOFACTOR`                                              |
| Códigos de respaldo (uno por uso) | `DEMOS-ADM01`, `DEMOS-ADM02`, `DEMOS-ADM03`, `DEMOS-ADM04`, `DEMOS-ADM05` |

- **App de autenticación:** añade una cuenta nueva «ingresando una clave» con ese secreto (tipo basado en tiempo) y verás los mismos códigos que da `pnpm demo:codigo`.
- **Código de respaldo:** en la pantalla del código pulsa «Usar un código de respaldo» y escribe uno de la lista.

El seed vuelve a dejar este 2FA como arriba cada vez que se ejecuta, y se niega a correr en producción.

## Otros accesos locales

| Servicio                                                           | Dónde                 | Acceso                                                         |
| ------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------- |
| Correos de prueba (Mailpit)                                        | http://localhost:8025 | Sin contraseña                                                 |
| pgAdmin (opcional, `docker compose --profile tools up -d pgadmin`) | http://localhost:5050 | `dev@example.com` / `pgadmin_dev_password` (de `.env.example`) |
| PostgreSQL                                                         | `localhost:5432`      | `roofing` / `roofing_dev_password` (de `.env.example`)         |

Todos estos valores son de desarrollo local y están publicados a propósito en los `.env.example`; no protegen nada real.
