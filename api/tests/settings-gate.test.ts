import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const saved = { ...process.env };

type DbModule = typeof import("../src/db.js");

// `env` is parsed once at import time, so each case needs a fresh module graph. Every
// graph gets its own PrismaClient, so the ones we create are tracked and closed.
const opened: DbModule[] = [];

async function load(nodeEnv: string) {
  vi.resetModules();
  process.env.NODE_ENV = nodeEnv;
  const [appMod, dbMod] = await Promise.all([import("../src/app.js"), import("../src/db.js")]);
  opened.push(dbMod);
  return { app: appMod.app, db: dbMod };
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.disconnectDb().catch(() => undefined)));
  process.env = { ...saved };
});

const paths = ["/api/settings", "/api/settings/test", "/api/settings/inspect", "/api/settings/reset"];

const switchInput = {
  preset: "postgresql" as const,
  connectionString: "postgresql://u:p@localhost:5432/other",
};

describe("/api/settings", () => {
  it("is not mounted in production — every path is a plain 404", async () => {
    const { app } = await load("production");
    for (const p of paths) {
      expect((await request(app).get(p)).status).toBe(404);
      expect((await request(app).post(p)).status).toBe(404);
    }
  });

  it("is mounted outside production, where auth is what turns requests away", async () => {
    // 401 rather than 404 is the proof the router is mounted: in production it is the
    // NODE_ENV gate that removes the route, not a missing or broken registration.
    const { app } = await load("development");
    expect((await request(app).get("/api/settings")).status).toBe(401);
  });
});

describe("switchDatabase / resetToDefault", () => {
  it("refuses to switch in production", async () => {
    const { db } = await load("production");
    await expect(db.switchDatabase(switchInput)).rejects.toThrow(/only available in development/i);
    await expect(db.resetToDefault()).rejects.toThrow(/only available in development/i);
  });

  it("refuses to switch in test, so a suite cannot repoint the database it asserts on", async () => {
    const { db } = await load("test");
    await expect(db.switchDatabase(switchInput)).rejects.toThrow(/only available in development/i);
    await expect(db.resetToDefault()).rejects.toThrow(/only available in development/i);
  });
});

describe("stored db config", () => {
  it("is ignored outside development, so production always serves DATABASE_URL", async () => {
    const { db } = await load("production");
    const status = await db.getActiveDbStatus();
    expect(status.source).toBe("default");
    expect(status.provider).toBe("postgresql");
  });
});