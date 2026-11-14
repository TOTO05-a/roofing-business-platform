# Cómo iniciar la demo (Windows)

Guía paso a paso para abrir y apagar toda la plataforma en tu computadora, pensada para quien no es técnico. **Es una demostración con datos inventados**: nada se publica en internet y ningún pago es real. Los usuarios para entrar están en [`CREDENCIALES.md`](CREDENCIALES.md).

## Requisitos (una sola vez)

| Programa       | Para qué                     | Cómo comprobarlo          |
| -------------- | ---------------------------- | ------------------------- |
| Node 26        | Ejecutar el proyecto         | `node -v` → `v26...`      |
| pnpm 12        | Instalar dependencias        | `pnpm -v` → `12...`       |
| Docker Desktop | Base de datos, correo, fotos | Ábrelo y espera «Running» |
| Git            | Descargar el código          | `git --version`           |

## Abrir la demo (cada vez)

**1. Abre Docker Desktop** y espera a que abajo a la izquierda diga **«Running»** (puede tardar un minuto).

**2. Abre una terminal en la carpeta del proyecto.** En el Explorador de archivos ve a `C:\Users\ac138\dev\roofing-business-platform`, haz clic derecho en un espacio vacío y elige **«Abrir en Terminal»**. (O abre PowerShell y escribe `cd C:\Users\ac138\dev\roofing-business-platform`.)

**3. Solo la primera vez, o si hay cambios nuevos**, escribe estos dos comandos (uno por uno, con Enter):

```bash
git pull
```

```bash
pnpm install
```

**4. Levanta todo con un solo comando:**

```bash
pnpm demo
```

Verás varios pasos con «▶» (tarda unos minutos la primera vez). Hace por ti:

1. Crea los archivos `.env` con valores **de prueba** locales, si faltan.
2. Levanta en Docker la base de datos, el buzón de correos de prueba y el almacenamiento de fotos.
3. Prepara la base de datos y su seguridad.
4. Siembra los datos de demostración: unos 26 clientes con sus propiedades, leads en todos los estados, citas de esta semana y la siguiente, inspecciones, presupuestos (con PDF) en todos los estados, proyectos en distintas etapas con fotos, facturas con pagos **simulados**, y un usuario por rol. Las fechas son relativas a «hoy», así que siempre parece actual.
5. Arranca el sitio, la plataforma y la API. **Deja esta terminal abierta mientras uses la demo.**

Se puede repetir sin miedo: no duplica datos ni cambia usuarios existentes.

**5. Abre el navegador** en **http://localhost:5173** y entra con un usuario de [`CREDENCIALES.md`](CREDENCIALES.md).

- Cliente y Empleado: solo correo y contraseña.
- Administrador y Superadministrador: además piden un código de 6 dígitos. **No hay que escanear nada**: abre una segunda terminal (otra pestaña) y escribe `pnpm demo:codigo`; copia el número que imprime.

## Direcciones

| Qué                 | URL                               |
| ------------------- | --------------------------------- |
| Sitio público       | http://localhost:4321/es/         |
| Plataforma (entrar) | http://localhost:5173             |
| API (estado)        | http://localhost:3000/api/health  |
| Correos de prueba   | http://localhost:8025             |
| Catálogo de diseño  | http://localhost:5173/componentes |

## Apagar

1. En la terminal donde corre `pnpm demo`, pulsa **Ctrl + C**.
2. Apaga los contenedores (los datos se conservan):

```bash
docker compose stop
```

Para borrar **todos** los datos locales y empezar de cero (no se puede deshacer; solo afecta a los datos de la demo en tu computadora):

```bash
docker compose down -v
```

y después vuelve a ejecutar `pnpm demo`.

## Paso a paso (si prefieres hacerlo a mano)

```bash
pnpm demo:preparar
```

```bash
pnpm dev
```

`pnpm demo:preparar` hace los pasos 1 a 4 sin arrancar los servidores. Los comandos individuales están en el [`README.md`](README.md).

## Si algo falla

| Síntoma                                                    | Solución                                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker: command not found` o error de conexión            | Abre Docker Desktop y espera a que diga «Running»; repite `pnpm demo`.                                                                                                   |
| `port is already allocated` / puerto ocupado               | Otro programa usa 5432, 4321, 5173 o 3000. Ciérralo o reinicia la PC. En PowerShell: `netstat -ano \| findstr :4321` muestra el proceso.                                 |
| Falla `db:deploy` al principio                             | PostgreSQL aún arrancaba: repite `pnpm demo`.                                                                                                                            |
| Falla `storage:init`                                       | Garage aún arrancaba: repite `pnpm demo`. Sin él no hay PDF ni fotos, pero el resto funciona.                                                                            |
| No llega el correo de una invitación                       | Los correos no salen a internet: míralos en http://localhost:8025.                                                                                                       |
| Pide un código de 6 dígitos al entrar                      | Es la verificación en dos pasos de admin y superadmin: ejecuta `pnpm demo:codigo` y escribe el número (ver [`CREDENCIALES.md`](CREDENCIALES.md)).                        |
| «El código no es correcto»                                 | El código dura unos 30 segundos: ejecuta `pnpm demo:codigo` otra vez y escríbelo enseguida. O usa un código de respaldo de `CREDENCIALES.md`.                            |
| «Demasiados intentos»                                      | Espera unos minutos, o reinicia con Ctrl + C y `pnpm demo`.                                                                                                              |
| Los datos se ven viejos o quiero la demo como al principio | `docker compose down -v` y luego `pnpm demo`.                                                                                                                            |
| Error tras un `git pull`                                   | Ejecuta `pnpm install` y luego `pnpm demo`.                                                                                                                              |
| «El puerto 5432 lo ocupa otro contenedor» o error `P3009`  | Hay otro proyecto Docker viejo encendido. `docker ps` lo muestra; detenlo con `docker stop <nombre>` y ejecuta `docker compose up -d --force-recreate postgres mailpit`. |
