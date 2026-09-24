import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaClient as MySqlPrismaClient } from "./generated/mysql/index.js";
import { PrismaClient as SqlitePrismaClient } from "./generated/sqlite/index.js";
import { PrismaClient as MongoPrismaClient } from "./generated/mongodb/index.js";
import { env } from "./env.js";
import { ApiError } from "./lib/errors.js";
import {
  DB_LABELS,
  redactConnectionString,
  schemaFileFor,
  type DbProvider,
  type DbSettingsInput,
  type ResolvedDb,
  resolveDb,
} from "./lib/dbsettings.js";

const execAsync = promisify(exec);

type SqlClient = PrismaClient;

export interface ActiveDb {
  provider: DbProvider;
  connectionString: string;
  source: "default" | "custom";
  configuredAt?: string;
}

export interface ActiveDbStatus extends Omit<ActiveDb, "connectionString"> {
  label: string;
  healthy: boolean;
  connection: string;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "db-config.json");

interface StoredDbConfig extends ActiveDb {}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function readStoredConfig(): StoredDbConfig | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoredDbConfig;
    if (parsed && typeof parsed.provider === "string" && typeof parsed.connectionString === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredConfig(cfg: StoredDbConfig) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function clearStoredConfig() {
  try {
    fs.rmSync(CONFIG_PATH, { force: true });
  } catch {
    // noop
  }
}

export function resolveDefaultDb(): ActiveDb {
  return { provider: "postgresql", connectionString: env.DATABASE_URL, source: "default" };
}

function loadActive(): ActiveDb {
  if (env.NODE_ENV === "test") return resolveDefaultDb();
  return readStoredConfig() ?? resolveDefaultDb();
}

export function createClient(provider: DbProvider, connectionString: string): SqlClient {
  const options = { datasources: { db: { url: connectionString } } };
  switch (provider) {
    case "mongodb":
      return new MongoPrismaClient(options) as unknown as SqlClient;
    case "mysql":
      return new MySqlPrismaClient(options) as unknown as SqlClient;
    case "sqlite":
      return new SqlitePrismaClient(options) as unknown as SqlClient;
    default:
      return new PrismaClient(options);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ApiError(504, "Database connection timed out.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function pingDb(client: SqlClient, provider: DbProvider): Promise<void> {
  if (provider === "mongodb") {
    const mongo = client as unknown as MongoPrismaClient;
    await mongo.$runCommandRaw({ ping: 1 });
    return;
  }
  await client.$queryRaw`SELECT 1`;
}

let current: ActiveDb = loadActive();

export let prisma: SqlClient = createClient(current.provider, current.connectionString);

export function activeDbProvider(): DbProvider {
  return current.provider;
}

export async function pingActiveDb(): Promise<void> {
  await withTimeout(pingDb(prisma, current.provider), 5000);
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect().catch(() => undefined);
}

function summarize(active: ActiveDb): ActiveDbStatus {
  return {
    provider: active.provider,
    label: DB_LABELS[active.provider],
    source: active.source,
    configuredAt: active.configuredAt,
    connection: redactConnectionString(active.connectionString),
    healthy: false,
  };
}

export async function getActiveDbStatus(): Promise<ActiveDbStatus> {
  const status = summarize(current);
  try {
    await pingActiveDb();
    status.healthy = true;
  } catch {
    status.healthy = false;
  }
  return status;
}

export async function testDatabase(input: DbSettingsInput): Promise<ResolvedDb> {
  const resolved = resolveDb(input);
  if (!resolved.connectionString) throw new ApiError(400, "A connection string is required.");

  const probe = createClient(resolved.provider, resolved.connectionString);
  try {
    await withTimeout(pingDb(probe, resolved.provider), 15000);
  } finally {
    await probe.$disconnect().catch(() => undefined);
  }
  return resolved;
}

export async function pushSchema(provider: DbProvider, connectionString: string, force = false): Promise<void> {
  const schema = schemaFileFor(provider);
  const prismaBin = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    `prisma${process.platform === "win32" ? ".cmd" : ""}`
  );
  const forceFlag = force ? " --accept-data-loss" : "";
  const command = `"${prismaBin}" db push --schema ${schema} --skip-generate${forceFlag}`;
  try {
    await execAsync(command, {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connectionString },
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (err) {
    const message = (err as Error).message ?? "";
    const tail = message.slice(-1200);
    throw new ApiError(400, `Schema sync failed. ${tail}`);
  }
}

export async function switchDatabase(
  input: DbSettingsInput,
  opts: { force?: boolean } = {}
): Promise<ActiveDbStatus> {
  if (env.NODE_ENV === "test") {
    throw new ApiError(400, "Switching databases is disabled in test mode.");
  }
  const resolved = resolveDb(input);
  if (!resolved.connectionString) throw new ApiError(400, "A connection string is required.");

  const probe = createClient(resolved.provider, resolved.connectionString);
  try {
    await withTimeout(pingDb(probe, resolved.provider), 15000);
  } finally {
    await probe.$disconnect().catch(() => undefined);
  }

  await pushSchema(resolved.provider, resolved.connectionString, opts.force ?? false);

  const next = createClient(resolved.provider, resolved.connectionString);
  await withTimeout(pingDb(next, resolved.provider), 15000);

  const previous = prisma;
  prisma = next;
  current = {
    provider: resolved.provider,
    connectionString: resolved.connectionString,
    source: "custom",
    configuredAt: new Date().toISOString(),
  };
  writeStoredConfig(current);
  await previous.$disconnect().catch(() => undefined);

  return getActiveDbStatus();
}

export async function resetToDefault(): Promise<ActiveDbStatus> {
  if (env.NODE_ENV === "test") {
    throw new ApiError(400, "Switching databases is disabled in test mode.");
  }
  clearStoredConfig();
  const defaultValue = resolveDefaultDb();
  const next = createClient(defaultValue.provider, defaultValue.connectionString);
  await withTimeout(pingDb(next, defaultValue.provider), 15000);

  const previous = prisma;
  prisma = next;
  current = defaultValue;
  await previous.$disconnect().catch(() => undefined);

  return getActiveDbStatus();
}