import { env } from './config/env.js';
import { buildServer } from './server.js';

const app = buildServer();

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`Fleet backend listening on port ${env.PORT}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
