import { createApp } from './app.js';
import { parseEnv } from './env.js';

const env = parseEnv();
const app = createApp({ isProduction: env.NODE_ENV === 'production' });

const server = app.listen(env.PORT, () => {
  console.log(`API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
