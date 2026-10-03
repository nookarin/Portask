import { beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

const stamp = Date.now();
const uniq = (label: string) => `${label.replace(/[^a-z0-9]/gi, "")}-${stamp}`;
const email = (label: string) => `${uniq(label)}@test.dev`;

const employeeAgent = request.agent(app);
const clientAgent = request.agent(app);

let companyId: string;
let projectId: string;
let employeeUserId: string;
let clientUserId: string;

let clientUpdateId: string;
let internalUpdateId: string;
let deliverableId: string;

async function register(agent: request.Agent, body: Record<string, unknown>) {
  const res = await agent.post("/api/auth/register").send(body);
  expect(res.status).toBe(201);
  return res.body.user;
}

async function createReport(overrides: Record<string, unknown> = {}) {
  const res = await employeeAgent
    .post("/api/reports")
    .send({ projectId, title: uniq("Report"), ...overrides })
    .expect(201);
  return res.body;
}

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}` } } });

  // Staff accounts are not self-service: the employee is provisioned like the image
  // bootstrap does (and like an admin would via POST /api/users) and then logs in.
  const employee = await prisma.user.create({
    data: {
      name: "Report Employee",
      email: email("repemp"),
      passwordHash: await bcrypt.hash("password123", 10),
      role: "EMPLOYEE",
    },
  });
  employeeUserId = employee.id;
  await employeeAgent
    .post("/api/auth/login")
    .send({ email: employee.email, password: "password123" })
    .expect(200);

  const client = await register(clientAgent, {
    name: "Report Client",
    email: email("repclient"),
    password: "password123",
    companyName: uniq("ReportCo"),
  });
  clientUserId = client.id;
  companyId = client.company.id;

  const project = await employeeAgent
    .post("/api/projects")
    .send({ name: uniq("ReportProject"), companyId })
    .expect(201);
  projectId = project.body.id;

  const clientUpdate = await employeeAgent
    .post(`/api/projects/${projectId}/updates`)
    .send({ title: uniq("Client update"), body: "Visible to the public", visibility: "CLIENT" })
    .expect(201);
  clientUpdateId = clientUpdate.body.id;

  const internalUpdate = await employeeAgent
    .post(`/api/projects/${projectId}/updates`)
    .send({ title: uniq("Internal update"), body: "SECRET internal note", visibility: "INTERNAL" })
    .expect(201);
  internalUpdateId = internalUpdate.body.id;

  const deliverable = await employeeAgent
    .post(`/api/projects/${projectId}/deliverables`)
    .send({ name: uniq("Brand deck") })
    .expect(201);
  deliverableId = deliverable.body.id;
});

describe("public token security", () => {
  it("issues a long random token, not a guessable id", async () => {
    const report = await createReport();
    expect(report.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(report.token).not.toBe(report.id);
  });

  it("issues a distinct token per report", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      const report = await createReport();
      tokens.add(report.token);
    }
    expect(tokens.size).toBe(4);
  });

  it("returns 404 for an unknown token without leaking existence", async () => {
    const res = await request(app).get("/public/report/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(res.status).toBe(404);
  });

  it("returns 404 for a malformed token", async () => {
    const res = await request(app).get("/public/report/short");
    expect(res.status).toBe(404);
  });

  it("marks the response noindex so crawlers do not archive it", async () => {
    const report = await createReport();
    const res = await request(app).get(`/public/report/${report.token}`).expect(200);
    expect(res.headers["x-robots-tag"]).toContain("noindex");
  });
});

describe("public report content", () => {
  it("is readable with no authentication at all", async () => {
    const report = await createReport({ title: uniq("Open to all") });
    await employeeAgent
      .put(`/api/reports/${report.id}/curation`)
      .send({ updateIds: [clientUpdateId], deliverableIds: [deliverableId] })
      .expect(200);

    const res = await request(app).get(`/public/report/${report.token}`).expect(200);
    expect(res.body.title).toBe(report.title);
    expect(res.body.updates).toHaveLength(1);
    expect(res.body.updates[0].id).toBe(clientUpdateId);
    expect(res.body.deliverables).toHaveLength(1);
  });

  it("never exposes INTERNAL updates, even if one is force-curated", async () => {
    const report = await createReport();
    // Bypass the curation endpoint to simulate a stale or hand-edited join row.
    await prisma.reportUpdate.create({
      data: { reportId: report.id, updateId: internalUpdateId },
    });

    const res = await request(app).get(`/public/report/${report.token}`).expect(200);
    const bodies = JSON.stringify(res.body);
    expect(res.body.updates).toHaveLength(0);
    expect(bodies).not.toContain("SECRET internal note");
    expect(bodies).not.toContain("INTERNAL");
  });

  it("does not leak the token owner, commenter IP hash, or internal metadata", async () => {
    const report = await createReport();
    await request(app)
      .post(`/public/report/${report.token}/comments`)
      .send({ authorName: "Visitor", body: "Looks good" })
      .expect(201);

    const res = await request(app).get(`/public/report/${report.token}`).expect(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("ipHash");
    expect(serialized).not.toContain("createdById");
    expect(serialized).not.toContain(email("repemp"));
    expect(serialized).not.toContain("PENDING");
  });
});

describe("curation guards", () => {
  it("rejects publishing an INTERNAL update", async () => {
    const report = await createReport();
    const res = await employeeAgent
      .put(`/api/reports/${report.id}/curation`)
      .send({ updateIds: [internalUpdateId] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/internal/i);
  });

  it("rejects updates belonging to another project", async () => {
    const other = await employeeAgent
      .post("/api/projects")
      .send({ name: uniq("Other"), companyId })
      .expect(201);

    const foreignUpdate = await employeeAgent
      .post(`/api/projects/${other.body.id}/updates`)
      .send({ title: uniq("Foreign"), body: "Elsewhere", visibility: "CLIENT" })
      .expect(201);

    const report = await createReport();
    const res = await employeeAgent
      .put(`/api/reports/${report.id}/curation`)
      .send({ updateIds: [foreignUpdate.body.id] });
    expect(res.status).toBe(400);
  });
});

describe("revocation and expiry", () => {
  it("stops serving the page once the link is revoked", async () => {
    const report = await createReport();
    await request(app).get(`/public/report/${report.token}`).expect(200);

    await employeeAgent.patch(`/api/reports/${report.id}`).send({ enabled: false }).expect(200);

    const res = await request(app).get(`/public/report/${report.token}`);
    expect(res.status).toBe(404);
  });

  it("stops serving the page once the expiry has passed", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const report = await createReport({ expiresAt: past });

    const res = await request(app).get(`/public/report/${report.token}`);
    expect(res.status).toBe(404);
  });

  it("serves the page while the expiry is still in the future", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const report = await createReport({ expiresAt: future });

    await request(app).get(`/public/report/${report.token}`).expect(200);
  });

  it("blocks comments after revocation", async () => {
    const report = await createReport();
    await employeeAgent.patch(`/api/reports/${report.id}`).send({ enabled: false }).expect(200);

    const res = await request(app)
      .post(`/public/report/${report.token}/comments`)
      .send({ authorName: "Visitor", body: "Too late" });
    expect(res.status).toBe(404);
  });
});

describe("public comments", () => {
  it("holds new comments as PENDING until an employee approves", async () => {
    const report = await createReport();
    const res = await request(app)
      .post(`/public/report/${report.token}/comments`)
      .send({ authorName: "Visitor", body: "Please review" })
      .expect(201);
    expect(res.body.status).toBe("PENDING");

    const pending = await request(app).get(`/public/report/${report.token}`).expect(200);
    expect(pending.body.comments).toHaveLength(0);

    await employeeAgent
      .patch(`/api/reports/${report.id}/comments/${res.body.id}`)
      .send({ status: "APPROVED" })
      .expect(200);

    const after = await request(app).get(`/public/report/${report.token}`).expect(200);
    expect(after.body.comments).toHaveLength(1);
    expect(after.body.comments[0].body).toBe("Please review");
  });

  it("hides comments marked as spam", async () => {
    const report = await createReport();
    const res = await request(app)
      .post(`/public/report/${report.token}/comments`)
      .send({ authorName: "Spammer", body: "buy now" })
      .expect(201);

    await employeeAgent
      .patch(`/api/reports/${report.id}/comments/${res.body.id}`)
      .send({ status: "SPAM" })
      .expect(200);

    const view = await request(app).get(`/public/report/${report.token}`).expect(200);
    expect(view.body.comments).toHaveLength(0);
  });

  it("rejects an empty or oversized comment", async () => {
    const report = await createReport();
    await request(app)
      .post(`/public/report/${report.token}/comments`)
      .send({ authorName: "Visitor", body: "" })
      .expect(400);
    await request(app)
      .post(`/public/report/${report.token}/comments`)
      .send({ authorName: "Visitor", body: "x".repeat(2001) })
      .expect(400);
  });

  it("rate limits repeat comments from one visitor", async () => {
    const report = await createReport();
    let limited = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await request(app)
        .post(`/public/report/${report.token}/comments`)
        .send({ authorName: "Flooder", body: `spam ${i}` });
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("notifies the report author about a pending comment", async () => {
    const report = await createReport();
    await request(app)
      .post(`/public/report/${report.token}/comments`)
      .send({ authorName: "Visitor", body: "Ping" })
      .expect(201);

    const notifications = await prisma.notification.findMany({
      where: { userId: employeeUserId, message: { contains: report.title } },
    });
    expect(notifications.length).toBeGreaterThan(0);
  });
});

describe("access control", () => {
  it("blocks anonymous access to report management", async () => {
    await request(app).get("/api/reports").expect(401);
  });

  it("blocks clients from report management", async () => {
    const res = await clientAgent.get("/api/reports");
    expect(res.status).toBe(403);
  });

  it("blocks clients from publishing a report", async () => {
    const res = await clientAgent.post("/api/reports").send({ projectId, title: "Sneaky" });
    expect(res.status).toBe(403);
  });

  it("lets employees publish a report", async () => {
    const report = await createReport();
    expect(report.projectId).toBe(projectId);
    expect(await prisma.progressReport.count({ where: { id: report.id } })).toBe(1);
  });

  it("does not let one employee moderate another report's comment via a mismatched id", async () => {
    const report = await createReport();
    const comment = await request(app)
      .post(`/public/report/${report.token}/comments`)
      .send({ authorName: "Visitor", body: "Scoped" })
      .expect(201);

    const other = await createReport();
    const res = await employeeAgent
      .patch(`/api/reports/${other.id}/comments/${comment.body.id}`)
      .send({ status: "APPROVED" });
    expect(res.status).toBe(404);
  });

  it("exposes no client user data through the public endpoint", async () => {
    const report = await createReport();
    const res = await request(app).get(`/public/report/${report.token}`).expect(200);
    expect(JSON.stringify(res.body)).not.toContain(clientUserId);
  });
});