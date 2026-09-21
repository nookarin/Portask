import { beforeAll, describe, expect, it } from "vitest";
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

beforeAll(async () => {
  // Clean up leftover rows from any previous failed run with the same stamp patterns.
  await prisma.user.deleteMany({
    where: { email: { contains: `-${stamp}` } },
  });

  const admin = await register(adminAgent, {
    name: "Test Admin",
    email: email("admin"),
    password: "password123",
    role: "ADMIN",
  });
  expect(admin.role).toBe("ADMIN");

  await register(employeeAgent, {
    name: "Test Employee",
    email: email("emp"),
    password: "password123",
    role: "EMPLOYEE",
  });

  const clientA = await register(clientAAgent, {
    name: "Client A",
    email: email("clienta"),
    password: "password123",
    role: "CLIENT",
    companyName: uniq("Acme"),
  });
  expect(clientA.company).toBeTruthy();
  companyIdA = clientA.company.id;

  const clientB = await register(clientBAgent, {
    name: "Client B",
    email: email("clientb"),
    password: "password123",
    role: "CLIENT",
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