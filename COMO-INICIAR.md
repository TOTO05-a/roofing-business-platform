# Cómo iniciar la demo (Windows)

Guía rápida para abrir y apagar toda la plataforma en tu computadora. Los usuarios para entrar están en [`CREDENCIALES.md`](CREDENCIALES.md).

## Requisitos (una sola vez)

| Programa       | Para qué                     | Cómo comprobarlo          |
| -------------- | ---------------------------- | ------------------------- |
| Node 26        | Ejecutar el proyecto         | `node -v` → `v26...`      |
| pnpm 12        | Instalar dependencias        | `pnpm -v` → `12...`       |
| Docker Desktop | Base de datos, correo, fotos | Ábrelo y espera «Running» |
| Git            | Descargar el código          | `git --version`           |

## Iniciar (el camino corto)

Abre una terminal (PowerShell o Git Bash) en la carpeta del proyecto, `C:\Users\ac138\dev\roofing-business-platform`:

```bash
git pull
```

```bash
pnpm install
```

```bash
pnpm demo
```

`pnpm demo` hace todo por ti:

1. Crea `.env` y `apps/api/.env` si no existen, con valores **de prueba** locales.
2. Levanta en Docker PostgreSQL, Mailpit (correos de prueba) y Garage (fotos).
3. Aplica las migraciones, pone las contraseñas de los roles de la base de datos y prepara el almacenamiento.
4. Siembra los datos de demostración: clientes, propiedades, leads, citas e inspecciones ficticios, y un usuario por rol.
5. Arranca el sitio, la plataforma y la API. Déjala abierta mientras uses la demo.

Se puede repetir sin miedo: no duplica datos ni cambia usuarios existentes.

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

Para borrar **todos** los datos locales y empezar de cero (no se puede deshacer):

```bash
docker compose down -v
```

## Paso a paso (si prefieres hacerlo a mano)

```bash
pnpm demo:preparar
```

```bash
pnpm dev
```

`pnpm demo:preparar` hace los pasos 1 a 4 sin arrancar los servidores. Los comandos individuales están en el [`README.md`](README.md).

## Si algo falla

| Síntoma                                                   | Solución                                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker: command not found` o error de conexión           | Abre Docker Desktop y espera a que diga «Running»; repite `pnpm demo`.                                                                                                   |
| `port is already allocated` / puerto ocupado              | Otro programa usa 5432, 4321, 5173 o 3000. Ciérralo o reinicia la PC. En PowerShell: `netstat -ano \| findstr :4321` muestra el proceso.                                 |
| Falla `db:deploy` al principio                            | PostgreSQL aún arrancaba: repite `pnpm demo`.                                                                                                                            |
| Falla `storage:init`                                      | Garage aún arrancaba: repite `pnpm demo`. Sin fotos, el resto de la app funciona.                                                                                        |
| No llega el correo de una invitación                      | Los correos no salen a internet: míralos en http://localhost:8025.                                                                                                       |
| Pide un código de 6 dígitos al entrar                     | Es la verificación en dos pasos de admin y superadmin: ver [`CREDENCIALES.md`](CREDENCIALES.md).                                                                         |
| Quiero empezar de cero                                    | `docker compose down -v` y luego `pnpm demo`.                                                                                                                            |
| Error tras un `git pull`                                  | Ejecuta `pnpm install` y luego `pnpm demo`.                                                                                                                              |
| «El puerto 5432 lo ocupa otro contenedor» o error `P3009` | Hay otro proyecto Docker viejo encendido. `docker ps` lo muestra; detenlo con `docker stop <nombre>` y ejecuta `docker compose up -d --force-recreate postgres mailpit`. |
