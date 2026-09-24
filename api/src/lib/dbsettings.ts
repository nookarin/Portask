import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const DB_PROVIDERS = ["postgresql", "mysql", "sqlite", "mongodb"] as const;
export type DbProvider = (typeof DB_PROVIDERS)[number];

export const DB_PRESETS = ["sqlite", "postgresql", "mysql", "mongodb", "custom"] as const;
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

export function resolveDb(input: DbSettingsInput): ResolvedDb {
  const provider = providerForPreset(input.preset, input.customProvider);
  let connectionString: string;
  switch (input.preset) {
    case "postgresql":
      connectionString = sqlConnection(input, "postgresql");
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