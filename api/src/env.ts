import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// Accepts "true"/"false" (any casing, surrounding whitespace ok), treats an empty or
// absent value as unset, and ignores garbage instead of crashing the process over a
// typo in a cookie setting.
const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "") return undefined;
  if (normalized !== "true" && normalized !== "false") {
    // eslint-disable-next-line no-console
    console.warn(`Ignoring invalid boolean "${value}" — expected "true" or "false".`);
    return undefined;
  }
  return normalized;
}, z.enum(["true", "false"]).transform((v) => v === "true").optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  PORT: z.coerce.number().default(5000),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_NAME: z.string().min(1).max(200).default("Administrator"),
  // Number of reverse-proxy hops in front of the API (0 = no proxy). Required for
  // `req.secure` and `req.ip` to reflect the browser's connection when TLS is
  // terminated upstream, e.g. TRUST_PROXY=1 for the bundled nginx.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  // Force the Secure flag on the session cookie. Leave unset to let the flag follow
  // the request protocol (Secure only for HTTPS requests in production).
  COOKIE_SECURE: optionalBoolean,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;