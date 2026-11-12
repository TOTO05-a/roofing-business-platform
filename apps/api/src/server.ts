import { createApp } from './app.js';
import { parseEnv } from './env.js';
import { createServices } from './services.js';

const env = parseEnv();
const services = createServices(env);
const app = createApp(services);

const server = app.listen(env.PORT, () => {
  console.log(`API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(): void {
  server.close(() => {
    void services.db.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
