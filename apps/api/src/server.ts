import { createApp } from './app.js';
import { parseEnv } from './env.js';
import { assertRlsEnforced } from './lib/rls.js';
import { createServices } from './services.js';

const env = parseEnv();
const services = createServices(env);
// Falla al arrancar si alguna conexión saltara la seguridad por fila (p. ej. el superusuario).
await assertRlsEnforced(services.db, 'APP_DATABASE_URL');
await assertRlsEnforced(services.systemDb, 'SYSTEM_DATABASE_URL');
const app = createApp(services);

const server = app.listen(env.PORT, () => {
  console.log(`API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(): void {
  server.close(() => {
    void Promise.all([services.db.$disconnect(), services.systemDb.$disconnect()]).finally(() =>
      process.exit(0),
    );
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
