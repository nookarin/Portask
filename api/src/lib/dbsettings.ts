import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const DB_PROVIDERS = ["postgresql", "mysql", "sqlite", "mongodb"] as const;
export type DbProvider = (typeof DB_PROVIDERS)[number];

export const DB_PRESETS = ["sqlite", "postgresql", "supabase", "mysql", "mongodb", "custom"] as const;
export type DbPreset = (typeof DB_PRESETS)[number];

export const dbPresetSchema = z.enum(DB_PRESETS);

export const dbSettingsSchema = z.object({
  preset: dbPresetSchema,
  customProvider: z.enum(DB_PROVIDERS).optional(),
  host: z.string().trim().optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  database: z.string().trim().optional(),
  user: z.string().trim().optional(),
  password: z.string().optional(),
  folder: z.string().trim().optional(),
  connectionString: z.string().trim().optional(),
});

export type DbSettingsInput = z.infer<typeof dbSettingsSchema>;

export interface ResolvedDb {
  provider: DbProvider;
  connectionString: string;
  label: string;
}

const PORT_DEFAULTS: Record<Exclude<DbProvider, "sqlite">, number> = {
  postgresql: 5432,
  mysql: 3306,
  mongodb: 27017,
};

export const DB_LABELS: Record<DbProvider, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "Local Database (SQLite)",
  mongodb: "MongoDB",
};

export function providerForPreset(preset: DbPreset, customProvider?: DbProvider): DbProvider {
  switch (preset) {
    case "sqlite":
      return "sqlite";
    case "postgresql":
    case "supabase":
      return "postgresql";
    case "mysql":
      return "mysql";
    case "mongodb":
      return "mongodb";
    case "custom":
      return customProvider ?? "postgresql";
  }
}

function authPrefix(user?: string, password?: string): string {
  if (!user && !password) return "";
  const u = user ? encodeURIComponent(user) : "";
  const p = password ? `:${encodeURIComponent(password)}` : "";
  return `${u}${p}@`;
}

function sqlConnection(input: DbSettingsInput, provider: "postgresql" | "mysql"): string {
  const host = input.host || "localhost";
  const port = input.port ?? PORT_DEFAULTS[provider];
  const database = input.database || "portask";
  return `${provider}://${authPrefix(input.user, input.password)}${host}:${port}/${database}`;
}

function mongoConnection(input: DbSettingsInput): string {
  if (input.connectionString) return input.connectionString;
  const host = input.host || "localhost";
  const port = input.port ?? PORT_DEFAULTS.mongodb;
  const database = input.database || "portask";
  return `mongodb://${authPrefix(input.user, input.password)}${host}:${port}/${database}`;
}

function sqliteConnection(input: DbSettingsInput): string {
  const folder = input.folder || "data";
  const file = input.database || "portask.db";
  const abs = path.resolve(process.cwd(), folder, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return `file:${abs.split(path.sep).join("/")}`;
}

function customConnection(input: DbSettingsInput): string {
  return input.connectionString ?? "";
}

function requireConnectionString(input: DbSettingsInput, label: string): string {
  const value = input.connectionString?.trim();
  if (!value) {
    throw new DbSettingsError(`A ${label} connection string is required.`);
  }
  return value;
}

const SUPABASE_TRANSACTION_POOLER_PORT = 6543;

/**
 * Supabase exposes a transaction pooler (6543) and a session pooler (5432).
 * Prisma relies on prepared statements, which the transaction pooler rejects,
 * so surface a warning instead of failing later with an opaque network error.
 */
export function inspectSupabaseUrl(url: string): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, warnings: ["That is not a valid URL."] };
  }

  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    warnings.push("Supabase connection strings normally start with postgresql://");
  }
  if (!parsed.hostname.endsWith(".supabase.com") && !parsed.hostname.includes(".pooler.supabase.")) {
    warnings.push("The host does not look like a Supabase project (expected *.supabase.com).");
  }
  if (parsed.port === String(SUPABASE_TRANSACTION_POOLER_PORT)) {
    warnings.push(
      `Port ${SUPABASE_TRANSACTION_POOLER_PORT} is Supabase's transaction pooler. It does not support prepared statements, so Prisma queries will fail intermittently. Use the session pooler on port 5432 instead.`
    );
  }
  if (!parsed.password) {
    warnings.push("No password found. Supabase requires the database password, not your account password.");
  }

  return { ok: true, warnings };
}

export class DbSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbSettingsError";
  }
}

export function resolveDb(input: DbSettingsInput): ResolvedDb {
  const provider = providerForPreset(input.preset, input.customProvider);
  let connectionString: string;
  switch (input.preset) {
    case "postgresql":
      connectionString = sqlConnection(input, "postgresql");
      break;
    case "supabase":
      connectionString = requireConnectionString(input, "supabase");
      break;
    case "mysql":
      connectionString = sqlConnection(input, "mysql");
      break;
    case "mongodb":
      connectionString = mongoConnection(input);
      break;
    case "sqlite":
      connectionString = sqliteConnection(input);
      break;
    case "custom":
    default:
      connectionString = customConnection(input);
      break;
  }
  return { provider, connectionString, label: DB_LABELS[provider] };
}

export function redactConnectionString(url: string): string {
  if (url.startsWith("file:")) return url;
  try {
    const u = new URL(url);
    if (u.username) u.username = "***";
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url.replace(/\/\/[^@/]+@/, "//***:***@");
  }
}

export function schemaFileFor(provider: DbProvider): string {
  switch (provider) {
    case "mongodb":
      return "prisma/schema.mongodb.prisma";
    case "mysql":
      return "prisma/schema.mysql.prisma";
    case "sqlite":
      return "prisma/schema.sqlite.prisma";
    default:
      return "prisma/schema.prisma";
  }
}