import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const stamp = Date.now();
const uniq = (label: string) => {
  const clean = label.replace(/[^a-z0-9]/gi, "");
  return `${clean}-${stamp}`;
};
const email = (label: string) => `${uniq(label)}@test.dev`;

const adminAgent = request.agent(app);
const employeeAgent = request.agent(app);
const clientAAgent = request.agent(app);
const clientBAgent = request.agent(app);

let companyIdA: string;
let projectId: string;

async function register(agent: request.Agent, body: Record<string, unknown>) {
  const res = await agent.post("/api/auth/register").send(body);
  if (res.status !== 201) {
    console.error("REGISTER FAILED", res.status, JSON.stringify(res.body));
  }
  expect(res.status).toBe(201);
  return res.body.user;
}

async function login(agent: request.Agent, userEmail: string) {
  const res = await agent
    .post("/api/auth/login")
    .send({ email: userEmail, password: "password123" })
    .expect(200);
  return res.body.user;
}

beforeAll(async () => {
  // Clean up leftover rows from any previous failed run with the same stamp patterns.
  await prisma.user.deleteMany({
    where: { email: { contains: `-${stamp}` } },
  });

  // The first admin comes from the image bootstrap (ADMIN_EMAIL/ADMIN_PASSWORD),
  // never from public signup.
  await prisma.user.create({
    data: {
      name: "Test Admin",
      email: email("admin"),
      passwordHash: await bcrypt.hash("password123", 10),
      role: "ADMIN",
    },
  });
  const admin = await login(adminAgent, email("admin"));
  expect(admin.role).toBe("ADMIN");

  // Employees are created by an existing admin through POST /api/users.
  await adminAgent
    .post("/api/users")
    .send({ name: "Test Employee", email: email("emp"), password: "password123", role: "EMPLOYEE" })
    .expect(201);
  await login(employeeAgent, email("emp"));

  const clientA = await register(clientAAgent, {
    name: "Client A",
    email: email("clienta"),
    password: "password123",
    companyName: uniq("Acme"),
  });
  expect(clientA.company).toBeTruthy();
  companyIdA = clientA.company.id;

  const clientB = await register(clientBAgent, {
    name: "Client B",
    email: email("clientb"),
    password: "password123",
    companyName: uniq("Globex"),
  });
  expect(clientB.company).toBeTruthy();

  const projectRes = await adminAgent
    .post("/api/projects")
    .send({ name: uniq("Website"), companyId: companyIdA })
    .expect(201);
  projectId = projectRes.body.id;
});

describe("health", () => {
  it("reports ok when the database is up", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("up");
  });
});

describe("authentication", () => {
  it("requires auth for protected routes", async () => {
    await request(app).get("/api/projects").expect(401);
  });

  it("returns the current user from /me", async () => {
    const res = await adminAgent.get("/api/auth/me").expect(200);
    expect(res.body.user.email).toBe(email("admin"));
  });

  it("rejects a bad password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: email("admin"), password: "wrong-password" })
      .expect(401);
    expect(res.body.error).toBe("Invalid email or password.");
  });

  it("logs out and clears the session", async () => {
    const res = await request(app).post("/api/auth/logout").expect(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("public registration", () => {
  it("rejects a role supplied in the request body", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Escalator",
        email: email("esc"),
        password: "password123",
        companyName: uniq("Evilcorp"),
        role: "ADMIN",
      })
      .expect(400);
    expect(res.body.error).toBe("Invalid input.");
    expect(await prisma.user.findUnique({ where: { email: email("esc") } })).toBeNull();
  });

  it("rejects a role of EMPLOYEE supplied in the request body", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({
        name: "Escalator",
        email: email("esc2"),
        password: "password123",
        companyName: uniq("Evilcorp2"),
        role: "EMPLOYEE",
      })
      .expect(400);
    expect(await prisma.user.findUnique({ where: { email: email("esc2") } })).toBeNull();
  });

  it("creates a client account", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Client C", email: email("clientc"), password: "password123", companyName: uniq("Initech") })
      .expect(201);
    expect(res.body.user.role).toBe("CLIENT");
  });

  it("requires a company", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "No Company", email: email("nocompany"), password: "password123" })
      .expect(400);
  });

  it("does not let a self-registered client reach admin-only routes", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/register")
      .send({ name: "Sneaky", email: email("sneaky"), password: "password123", companyName: uniq("SneakyCo") })
      .expect(201);
    await agent.get("/api/users").expect(403);
  });

  it("lets an admin create staff through /api/users", async () => {
    const res = await adminAgent
      .post("/api/users")
      .send({ name: "Second Employee", email: email("emp2"), password: "password123", role: "EMPLOYEE" })
      .expect(201);
    expect(res.body.user.role).toBe("EMPLOYEE");
  });
});

describe("project access control", () => {
  it("lists the project for its own client company", async () => {
    const res = await clientAAgent.get("/api/projects").expect(200);
    expect(res.body.some((p: { id: string }) => p.id === projectId)).toBe(true);
  });

  it("hides the project from the other client company", async () => {
    const res = await clientBAgent.get("/api/projects").expect(200);
    expect(res.body.some((p: { id: string }) => p.id === projectId)).toBe(false);
  });

  it("blocks access to the project detail for a foreign client", async () => {
    await clientBAgent.get(`/api/projects/${projectId}`).expect(403);
  });
});

describe("tasks", () => {
  it("creates a task and logs activity", async () => {
    const res = await employeeAgent
      .post(`/api/projects/${projectId}/tasks`)
      .send({ title: uniq("Design hero"), priority: "HIGH", clientVisible: true })
      .expect(201);
    const taskId = res.body.id;

    await employeeAgent.patch(`/api/tasks/${taskId}`).send({ status: "IN_PROGRESS" }).expect(200);

    const activity = await adminAgent.get(`/api/projects/${projectId}/activity`).expect(200);
    expect(activity.body.some((a: { action: string }) => a.action === "TASK_STATUS_CHANGED")).toBe(true);
  });

  it("lets a client create tasks? no — clients get 403", async () => {
    await clientAAgent.post(`/api/projects/${projectId}/tasks`).send({ title: "blocked" }).expect(403);
  });
});

describe("updates", () => {
  it("posts a client-visible update and notifies the client", async () => {
    const title = uniq("Weekly status");
    await employeeAgent
      .post(`/api/projects/${projectId}/updates`)
      .send({ title, body: "Progress is good.", progress: 60, visibility: "CLIENT" })
      .expect(201);

    const clientView = await clientAAgent.get(`/api/projects/${projectId}`).expect(200);
    expect(clientView.body.updates.some((u: { title: string }) => u.title === title)).toBe(true);

    const notifs = await clientAAgent.get("/api/notifications").expect(200);
    expect(notifs.body.some((n: { message: string }) => n.message.includes(title))).toBe(true);
  });

  it("hides internal updates from clients", async () => {
    const title = uniq("Internal note");
    await employeeAgent
      .post(`/api/projects/${projectId}/updates`)
      .send({ title, body: "Do not share.", visibility: "INTERNAL" })
      .expect(201);

    const clientView = await clientAAgent.get(`/api/projects/${projectId}`).expect(200);
    expect(clientView.body.updates.some((u: { title: string }) => u.title === title)).toBe(false);
  });
});

describe("deliverable review flow", () => {
  let deliverableId: string;

  it("employee uploads a deliverable awaiting review", async () => {
    const res = await employeeAgent
      .post(`/api/projects/${projectId}/deliverables`)
      .send({ name: uniq("Hero v2"), description: "Second pass" })
      .expect(201);
    expect(res.body.status).toBe("AWAITING_CLIENT_REVIEW");
    deliverableId = res.body.id;
  });

  it("client approves it and the employee is notified", async () => {
    await clientAAgent.post(`/api/deliverables/${deliverableId}/approve`).expect(200);
    const empNotifs = await employeeAgent.get("/api/notifications").expect(200);
    expect(empNotifs.body.some((n: { message: string }) => n.message.includes("was approved"))).toBe(true);
  });

  it("foreign client cannot approve it", async () => {
    await clientBAgent.post(`/api/deliverables/${deliverableId}/approve`).expect(403);
  });
});

describe("comments", () => {
  it("client comments on an update", async () => {
    const updates = await clientAAgent.get(`/api/projects/${projectId}/updates`).expect(200);
    const update = updates.body.find((u: { visibility: string }) => u.visibility === "CLIENT")!;
    const res = await clientAAgent
      .post(`/api/updates/${update.id}/comments`)
      .send({ body: "Looks great!" })
      .expect(201);
    expect(res.body.body).toBe("Looks great!");
  });
});

describe("dashboard", () => {
  it("returns role-aware metrics", async () => {
    const res = await adminAgent.get("/api/dashboard").expect(200);
    expect(res.body.counts.activeProjects).toBeGreaterThanOrEqual(1);
  });

  it("returns flat activity log items for clients", async () => {
    const res = await clientAAgent.get("/api/dashboard").expect(200);
    expect(Array.isArray(res.body.recentActivity)).toBe(true);
    for (const activity of res.body.recentActivity) {
      expect(activity.user).toBeDefined();
      expect(activity.action).toBeDefined();
      expect(activity.projectId).toBeDefined();
    }
  });
});

describe("calendar", () => {
  const wideStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const wideEnd = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const feedUrl = `/api/calendar?start=${encodeURIComponent(wideStart)}&end=${encodeURIComponent(wideEnd)}`;
  let milestoneId: string;
  let privateTaskId: string;

  it("returns a sorted event feed scoped by role", async () => {
    const res = await adminAgent.get(feedUrl).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const e of res.body) {
      expect(e.type).toMatch(/^(TASK|MILESTONE|PROJECT)$/);
      expect(e.title).toBeTruthy();
      expect(e.date).toBeTruthy();
    }
  });

  it("includes milestones and hides internal tasks from clients", async () => {
    const milestoneRes = await employeeAgent
      .post(`/api/projects/${projectId}/milestones`)
      .send({ name: uniq("Launch"), dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString() })
      .expect(201);
    milestoneId = milestoneRes.body.id;

    const taskRes = await employeeAgent
      .post(`/api/projects/${projectId}/tasks`)
      .send({ title: uniq("Secret internal"), clientVisible: false })
      .expect(201);
    privateTaskId = taskRes.body.id;
    await employeeAgent
      .patch(`/api/tasks/${privateTaskId}`)
      .send({ dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString() })
      .expect(200);

    const employeeFeed = await employeeAgent.get(feedUrl).expect(200);
    expect(employeeFeed.body.some((e: { id: string }) => e.id === `milestone-${milestoneId}`)).toBe(true);
    expect(employeeFeed.body.some((e: { id: string }) => e.id === `task-${privateTaskId}`)).toBe(true);
  });

  it("the owning client sees the milestone but not internal tasks", async () => {
    const a = await clientAAgent.get(feedUrl).expect(200);
    expect(a.body.some((e: { id: string }) => e.id === `milestone-${milestoneId}`)).toBe(true);
    expect(a.body.some((e: { id: string }) => e.id === `task-${privateTaskId}`)).toBe(false);
  });

  it("the foreign client sees neither", async () => {
    const b = await clientBAgent.get(feedUrl).expect(200);
    expect(b.body.some((e: { id: string }) => e.id === `milestone-${milestoneId}`)).toBe(false);
    expect(b.body.some((e: { id: string }) => e.id === `task-${privateTaskId}`)).toBe(false);
  });
});

describe("profile", () => {
  it("updates the current user's profile", async () => {
    const res = await employeeAgent
      .patch("/api/profile")
      .send({ name: "Renamed Employee", avatarUrl: "/uploads/avatar.png" })
      .expect(200);
    expect(res.body.user.name).toBe("Renamed Employee");
    expect(res.body.user.avatarUrl).toBe("/uploads/avatar.png");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects a password change with the wrong current password", async () => {
    await employeeAgent
      .patch("/api/profile")
      .send({ currentPassword: "nope-wrong", newPassword: "brandnew123" })
      .expect(401);
  });

  it("allows clients to view and update their profile", async () => {
    const view = await clientAAgent.get("/api/profile").expect(200);
    expect(view.body.user.email).toBe(email("clienta"));
    const updated = await clientAAgent.patch("/api/profile").send({ avatarUrl: "/uploads/ca.png" }).expect(200);
    expect(updated.body.user.avatarUrl).toBe("/uploads/ca.png");
  });
});

describe("validation", () => {
  it("rejects invalid input with 400", async () => {
    const res = await adminAgent
      .post("/api/projects")
      .send({ name: "", companyId: companyIdA })
      .expect(400);
    expect(res.body.error).toBe("Invalid input.");
  });
});

// Kept last on purpose: these tests deliberately exhaust a per-IP/per-account budget, so
// anything added below them would start out throttled.
describe("rate limiting", () => {
  it("throttles repeated failed logins for a single account", async () => {
    const target = email("throttle");
    for (let i = 0; i < 5; i += 1) {
      await request(app).post("/api/auth/login").send({ email: target, password: "wrong-password" }).expect(401);
    }

    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ email: target, password: "wrong-password" })
      .expect(429);
    expect(blocked.body.error).toContain("Too many failed sign-in attempts");
    expect(blocked.headers["ratelimit-limit"]).toBeDefined();
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("throttles mass signups from one connection", async () => {
    let blocked: request.Response | null = null;

    for (let i = 0; i < 15 && !blocked; i += 1) {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: `Signup ${i}`,
          email: email(`signup${i}`),
          password: "password123",
          companyName: uniq(`SignupCo${i}`),
        });
      if (res.status === 429) blocked = res;
      else expect(res.status).toBe(201);
    }

    expect(blocked).not.toBeNull();
    expect(blocked!.body.error).toContain("Too many accounts created");
    expect(blocked!.headers["retry-after"]).toBeDefined();
  });
});