import { describe, expect, it, vi } from "vitest";
import request from "supertest";

const created: { role: string; email: string; companyId?: string }[] = [];

vi.mock("../src/db.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data as never);
        return { id: "u1", ...data, company: { id: "co1", name: "Acme" } };
      }),
    },
    company: {
      create: vi.fn(async ({ data }: { data: { name: string } }) => ({ id: "co1", ...data })),
    },
  },
  disconnectDb: vi.fn(),
  pingActiveDb: vi.fn(),
}));

const { app } = await import("../src/app.js");

describe("public register allows CLIENT or FREELANCER only", () => {
  it("rejects role: ADMIN", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "E", email: "e@x.dev", password: "password123", companyName: "Acme", role: "ADMIN" });
    expect(res.status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it("rejects role: EMPLOYEE", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "E", email: "e@x.dev", password: "password123", companyName: "Acme", role: "EMPLOYEE" });
    expect(res.status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it("creates CLIENT when no role is sent", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "C", email: "c@x.dev", password: "password123", companyName: "Acme" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("CLIENT");
    expect(created).toHaveLength(1);
    expect(created[0].role).toBe("CLIENT");
  });

  it("requires a company for CLIENT", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "C", email: "c2@x.dev", password: "password123" });
    expect(res.status).toBe(400);
  });

  it("creates FREELANCER without a company", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "F", email: "f@x.dev", password: "password123", role: "FREELANCER" });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("FREELANCER");
    expect(created.at(-1)?.companyId).toBeUndefined();
  });
});