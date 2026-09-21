import { app } from "./app.js";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";

app.listen(env.PORT, () => {
  logger.info(`Portask API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});