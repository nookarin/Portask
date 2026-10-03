import { afterEach, describe, expect, it, vi } from "vitest";

const saved = { ...process.env };

async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { env } = await import("../src/env.js");
  return env;
}

const base = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/portask_test",
  JWT_SECRET: "test-secret-at-least-8-chars",
  COOKIE_SECURE: undefined,
  TRUST_PROXY: undefined,
};

afterEach(() => {
  process.env = { ...saved };
});

describe("COOKIE_SECURE parsing", () => {
  it("is undefined when absent or empty", async () => {
    expect((await loadEnv(base)).COOKIE_SECURE).toBeUndefined();
    expect((await loadEnv({ ...base, COOKIE_SECURE: "" })).COOKIE_SECURE).toBeUndefined();
    expect((await loadEnv({ ...base, COOKIE_SECURE: "   " })).COOKIE_SECURE).toBeUndefined();
  });

  it("parses true/false case-insensitively with whitespace", async () => {
    expect((await loadEnv({ ...base, COOKIE_SECURE: "true" })).COOKIE_SECURE).toBe(true);
    expect((await loadEnv({ ...base, COOKIE_SECURE: " TRUE " })).COOKIE_SECURE).toBe(true);
    expect((await loadEnv({ ...base, COOKIE_SECURE: "false" })).COOKIE_SECURE).toBe(false);
    expect((await loadEnv({ ...base, COOKIE_SECURE: "False" })).COOKIE_SECURE).toBe(false);
  });

  it("falls back to unset for garbage instead of crashing the process", async () => {
    expect((await loadEnv({ ...base, COOKIE_SECURE: "yes-please" })).COOKIE_SECURE).toBeUndefined();
  });
});

describe("TRUST_PROXY parsing", () => {
  it("defaults to 0 when absent", async () => {
    expect((await loadEnv(base)).TRUST_PROXY).toBe(0);
  });

  it("accepts an explicit hop count", async () => {
    expect((await loadEnv({ ...base, TRUST_PROXY: "1" })).TRUST_PROXY).toBe(1);
    expect((await loadEnv({ ...base, TRUST_PROXY: "2" })).TRUST_PROXY).toBe(2);
  });
});