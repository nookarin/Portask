import { app } from "./app.js";
import { env } from "./env.js";
import { bootstrapAdmin } from "./lib/bootstrapAdmin.js";
import { logger } from "./lib/logger.js";

try {
  await bootstrapAdmin();
} catch (err) {
  logger.error("Admin bootstrap failed:", (err as Error).message);
  process.exit(1);
}

if (env.NODE_ENV === "production" && env.COOKIE_SECURE === undefined) {
  logger.warn(
    "COOKIE_SECURE is unset — the session cookie is marked Secure only for HTTPS requests. " +
      "Terminate TLS upstream and set TRUST_PROXY to the number of proxy hops, " +
      "or set COOKIE_SECURE=false if this deployment is intentionally plain HTTP."
  );
}

app.listen(env.PORT, () => {
  logger.info(`Portask API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});