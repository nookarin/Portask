import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const envHolder: { ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string; ADMIN_NAME: string } = {
  ADMIN_NAME: "Administrator",
};
vi.mock("../src/env.js", () => ({ env: envHolder }));

const prismaMock = {
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
};
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { bootstrapAdmin } = await import("../src/lib/bootstrapAdmin.js");

beforeEach(() => {
  vi.clearAllMocks();
  envHolder.ADMIN_EMAIL = undefined;
  envHolder.ADMIN_PASSWORD = undefined;
  envHolder.ADMIN_NAME = "Administrator";
  prismaMock.user.findUnique.mockResolvedValue(null);
});

describe("bootstrapAdmin", () => {
  it("is a no-op when an admin already exists", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ email: "boss@portask.dev" });
    await bootstrapAdmin();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("throws instead of shipping a default account when credentials are missing", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(bootstrapAdmin()).rejects.toThrow(/ADMIN_EMAIL and ADMIN_PASSWORD/);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("creates the first admin from the environment", async () => {
    envHolder.ADMIN_EMAIL = "boss@portask.dev";
    envHolder.ADMIN_PASSWORD = "super-secret-pass";
    envHolder.ADMIN_NAME = "Boss";
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: "admin-1",
    }));

    await bootstrapAdmin();

    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    const arg = prismaMock.user.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.email).toBe("boss@portask.dev");
    expect(arg.data.name).toBe("Boss");
    expect(arg.data.role).toBe("ADMIN");
    expect(await bcrypt.compare("super-secret-pass", arg.data.passwordHash as string)).toBe(true);
  });

  it("rejects a short password and an email already taken", async () => {
    envHolder.ADMIN_EMAIL = "boss@portask.dev";
    envHolder.ADMIN_PASSWORD = "short";
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(bootstrapAdmin()).rejects.toThrow(/at least 8 characters/);

    envHolder.ADMIN_PASSWORD = "super-secret-pass";
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing" });
    await expect(bootstrapAdmin()).rejects.toThrow(/already used/);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});