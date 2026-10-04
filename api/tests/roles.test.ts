import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The role model is the thing under test here, and the guards read the session's user
// from the database, so Prisma is the only thing faked. Every assertion below is about
// real middleware: who gets through, and what reaches the handler.
const prismaMock = {
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  project: { findUnique: vi.fn(), delete: vi.fn() },
  projectMember: { upsert: vi.fn() },
  activityLog: { create: vi.fn() },
  company: { findMany: vi.fn() },
};
vi.mock("../src/db.js", () => ({
  prisma: prismaMock,
  activeDbProvider: "postgresql",
  pingActiveDb: vi.fn(),
  getActiveDbStatus: vi.fn(),
  getConfigPath: vi.fn(),
  switchDatabase: vi.fn(),
  resetToDefault: vi.fn(),
  testDatabase: vi.fn(),
}));

const { app } = await import("../src/app.js");
const { COOKIE_NAME, signToken } = await import("../src/lib/jwt.js");

type Role = "ADMIN" | "MANAGER" | "EMPLOYEE" | "FREELANCER" | "CLIENT";

function as(role: Role, id = `u-${role}`) {
  return request.agent(app).set("Cookie", `${COOKIE_NAME}=${signToken(id, role)}`);
}

/**
 * `user.findUnique` answers two different questions in these routes — "who is this
 * session?" and "does this email already exist?" / "is this user real?" — so one
 * implementation has to answer both by looking at the `where` clause. Getting this
 * wrong returns a session user with no `role`, which fails every guard with a 403 that
 * looks like a permissions bug rather than a test bug.
 */
let sessionUser: Record<string, unknown>;
const otherUsers: Record<string, Record<string, unknown>> = {};

function sessionAs(role: Role, extra: Record<string, unknown> = {}) {
  sessionUser = {
    id: `u-${role}`,
    email: `${role.toLowerCase()}@portask.dev`,
    name: role,
    role,
    companyId: null,
    bio: null,
    availableForWork: false,
    ...extra,
  };
  prismaMock.user.findUnique.mockImplementation(
    ({ where }: { where: { id?: string; email?: string } }) => {
      if (where.email) return Promise.resolve(null); // no duplicate account
      if (where.id === sessionUser.id) return Promise.resolve(sessionUser);
      return Promise.resolve(otherUsers[where.id!] ?? null);
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(otherUsers)) delete otherUsers[key];
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.company.findMany.mockResolvedValue([]);
});

describe("role groups", () => {
  it("treats every internal role as internal and only admin+manager as management", async () => {
    const { isInternal, isManagement } = await import("../src/lib/roles.js");
    expect(["ADMIN", "MANAGER", "EMPLOYEE", "FREELANCER"].every(isInternal)).toBe(true);
    expect(isInternal("CLIENT")).toBe(false);
    expect(["ADMIN", "MANAGER"].every(isManagement)).toBe(true);
    expect(isManagement("EMPLOYEE")).toBe(false);
    expect(isManagement("FREELANCER")).toBe(false);
  });
});

describe("GET /api/talent", () => {
  it("requires a session", async () => {
    await request(app).get("/api/talent").expect(401);
  });

  it.each(["EMPLOYEE", "FREELANCER", "CLIENT"] as Role[])("is closed to %s", async (role) => {
    sessionAs(role);
    await as(role).get("/api/talent").expect(403);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "MANAGER"] as Role[])("is open to %s", async (role) => {
    sessionAs(role);
    prismaMock.user.findMany.mockResolvedValue([]);
    await as(role).get("/api/talent").expect(200);
  });

  it("returns only available freelancers, with just the staffing fields", async () => {
    sessionAs("MANAGER");
    const talent = [
      { id: "f1", name: "Freya", email: "freya@portask.dev", bio: "Brand design", availableForWork: true },
    ];
    prismaMock.user.findMany.mockResolvedValue(talent);

    const res = await as("MANAGER").get("/api/talent").expect(200);
    expect(res.body.talent).toEqual(talent);

    const call = prismaMock.user.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ role: "FREELANCER", availableForWork: true });
    // Never leak the password hash, even though it is not selected.
    expect(call.select).not.toHaveProperty("passwordHash");
  });
});

describe("PATCH /api/profile availability", () => {
  it("rejects availability from a non-freelancer", async () => {
    sessionAs("EMPLOYEE");
    const res = await as("EMPLOYEE")
      .patch("/api/profile")
      .send({ availableForWork: true })
      .expect(400);
    expect(res.body.error).toMatch(/only freelancers/i);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("stores availability and bio for a freelancer", async () => {
    sessionAs("FREELANCER");
    prismaMock.user.update.mockResolvedValue({
      id: "u-FREELANCER",
      email: "freelancer@portask.dev",
      name: "FREELANCER",
      role: "FREELANCER",
      bio: "Brand design",
      availableForWork: true,
    });

    const res = await as("FREELANCER")
      .patch("/api/profile")
      .send({ availableForWork: true, bio: "  Brand design  " })
      .expect(200);

    expect(prismaMock.user.update.mock.calls[0][0].data).toMatchObject({
      availableForWork: true,
      bio: "Brand design",
    });
    expect(res.body.user.availableForWork).toBe(true);
    expect(res.body.user.bio).toBe("Brand design");
  });

  it("treats an empty bio as clearing it", async () => {
    sessionAs("FREELANCER");
    prismaMock.user.update.mockResolvedValue({
      id: "u-FREELANCER",
      email: "freelancer@portask.dev",
      name: "FREELANCER",
      role: "FREELANCER",
      bio: null,
      availableForWork: false,
    });

    await as("FREELANCER").patch("/api/profile").send({ bio: "" }).expect(200);
    expect(prismaMock.user.update.mock.calls[0][0].data.bio).toBeNull();
  });

  it("still lets a non-freelancer write a bio", async () => {
    sessionAs("EMPLOYEE");
    prismaMock.user.update.mockResolvedValue({
      id: "u-EMPLOYEE",
      email: "employee@portask.dev",
      name: "EMPLOYEE",
      role: "EMPLOYEE",
      bio: "Hello",
      availableForWork: false,
    });

    await as("EMPLOYEE").patch("/api/profile").send({ bio: "Hello" }).expect(200);
    expect(prismaMock.user.update.mock.calls[0][0].data).toEqual({ bio: "Hello" });
  });

  it("rejects a bio over the limit", async () => {
    sessionAs("FREELANCER");
    await as("FREELANCER").patch("/api/profile").send({ bio: "x".repeat(501) }).expect(400);
  });
});

describe("/api/users", () => {
  it("is open to a manager", async () => {
    sessionAs("MANAGER");
    await as("MANAGER").get("/api/users").expect(200);
  });

  it.each(["EMPLOYEE", "FREELANCER", "CLIENT"] as Role[])("is closed to %s", async (role) => {
    sessionAs(role);
    await as(role).get("/api/users").expect(403);
  });

  it("stops a manager from creating another admin", async () => {
    sessionAs("MANAGER");
    const res = await as("MANAGER")
      .post("/api/users")
      .send({ name: "Sneaky", email: "s@portask.dev", password: "password123", role: "ADMIN" })
      .expect(403);
    expect(res.body.error).toMatch(/only an admin/i);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("lets a manager create a freelancer", async () => {
    sessionAs("MANAGER");
    prismaMock.user.create.mockResolvedValue({ id: "f1" });
    await as("MANAGER")
      .post("/api/users")
      .send({ name: "Freya", email: "freya@portask.dev", password: "password123", role: "FREELANCER" })
      .expect(201);

    expect(prismaMock.user.create.mock.calls[0][0].data.role).toBe("FREELANCER");
  });

  it("lets an admin create an admin", async () => {
    sessionAs("ADMIN");
    prismaMock.user.create.mockResolvedValue({ id: "a2" });

    await as("ADMIN")
      .post("/api/users")
      .send({ name: "Second", email: "second@portask.dev", password: "password123", role: "ADMIN" })
      .expect(201);
  });

  it("rejects a role that is not in the enum", async () => {
    sessionAs("ADMIN");
    await as("ADMIN")
      .post("/api/users")
      .send({ name: "Ghost", email: "g@portask.dev", password: "password123", role: "SUPERUSER" })
      .expect(400);
  });
});

describe("DELETE /api/projects/:id", () => {
  it("lets a manager delete a project", async () => {
    sessionAs("MANAGER");
    prismaMock.project.delete.mockResolvedValue({});

    await as("MANAGER").delete("/api/projects/p1").expect(200);
    expect(prismaMock.project.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });

  it.each(["EMPLOYEE", "FREELANCER", "CLIENT"] as Role[])("refuses %s", async (role) => {
    sessionAs(role);
    await as(role).delete("/api/projects/p1").expect(403);
    expect(prismaMock.project.delete).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/:id/members", () => {
  it("lets a freelancer be staffed onto a project", async () => {
    sessionAs("MANAGER");
    otherUsers.f1 = { id: "f1", name: "Freya", role: "FREELANCER" };
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", name: "Relaunch" });
    prismaMock.projectMember.upsert.mockResolvedValue({ projectId: "p1", userId: "f1" });

    await as("MANAGER").post("/api/projects/p1/members").send({ userId: "f1" }).expect(201);
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
  });

  it("refuses a client", async () => {
    sessionAs("CLIENT");
    await as("CLIENT").post("/api/projects/p1/members").send({ userId: "f1" }).expect(403);
  });
});

describe("/api/settings", () => {
  it("is still admin-only even though other management routes are not", async () => {
    sessionAs("MANAGER");
    await as("MANAGER").get("/api/settings").expect(403);
  });
});
