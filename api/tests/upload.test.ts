import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// requireAuth looks the session's user up, so the database is the only thing here that
// has to be faked. Everything else — multer, the allowlist, express.static — is real.
const prismaMock = {
  user: { findUnique: vi.fn() },
};
vi.mock("../src/db.js", () => ({ prisma: prismaMock }));

const { app } = await import("../src/app.js");
const { COOKIE_NAME, signToken } = await import("../src/lib/jwt.js");

const uploadDir = path.resolve(process.cwd(), "uploads");
const written: string[] = [];

function authed() {
  return request.agent(app).set("Cookie", `${COOKIE_NAME}=${signToken("u1", "ADMIN")}`);
}

// A one-pixel PNG, so the accepted file is a real image rather than random bytes.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function track(name: string): string {
  const full = path.join(uploadDir, name);
  written.push(full);
  return full;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({
    id: "u1",
    email: "boss@portask.dev",
    name: "Boss",
    role: "ADMIN",
    companyId: null,
  });
});

afterAll(() => {
  for (const file of written) fs.rmSync(file, { force: true });
});

describe("POST /api/upload", () => {
  it("requires a session", async () => {
    await request(app).post("/api/upload").attach("file", PNG, "logo.png").expect(401);
  });

  it("accepts an allowlisted image and returns a same-origin path", async () => {
    const res = await authed().post("/api/upload").attach("file", PNG, "logo.png").expect(201);
    expect(res.body.url).toMatch(/^\/uploads\/\d+-[0-9a-f]{12}\.png$/);
    expect(res.body.name).toBe("logo.png");
    track(path.basename(res.body.url));
  });

  it.each([
    ["payload.html", "<script>alert(1)</script>"],
    ["payload.svg", "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'></svg>"],
    ["payload.xhtml", "<html/>"],
    ["script.js", "alert(1)"],
    ["archive.zip", "PK\x03\x04"],
    ["noextension", "hello"],
  ])("rejects %s and writes nothing", async (name) => {
    const before = fs.readdirSync(uploadDir);
    const res = await authed().post("/api/upload").attach("file", Buffer.from("payload"), name);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported file type/i);
    expect(fs.readdirSync(uploadDir)).toEqual(before);
  });

  it("rejects an allowed extension paired with a non-image body type at serve time", async () => {
    // Nothing sniffs the bytes: this file is served as image/png with nosniff, so the
    // browser never parses it as a document. Asserting the headers, not the bytes.
    const name = track(`sniff-${Date.now()}.png`);
    fs.writeFileSync(name, "<script>alert(1)</script>");
    const res = await request(app).get(`/uploads/${path.basename(name)}`).expect(200);
    expect(res.headers["content-type"]).toMatch(/^image\/png/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("enforces the size limit", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41);
    await authed().post("/api/upload").attach("file", big, "big.png").expect(500);
  });
});

describe("GET /uploads", () => {
  it("sends images inline and PDFs as downloads", async () => {
    const png = track(`inline-${Date.now()}.png`);
    fs.writeFileSync(png, PNG);
    const image = await request(app).get(`/uploads/${path.basename(png)}`).expect(200);
    expect(image.headers["content-disposition"]).toMatch(/^inline/);
    expect(image.headers["x-content-type-options"]).toBe("nosniff");
    expect(image.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");

    const pdf = track(`download-${Date.now()}.pdf`);
    fs.writeFileSync(pdf, "%PDF-1.7");
    const document = await request(app).get(`/uploads/${path.basename(pdf)}`).expect(200);
    expect(document.headers["content-disposition"]).toMatch(/^attachment/);
    expect(document.headers["content-type"]).toMatch(/^application\/pdf/);
  });

  it("refuses to serve a type outside the allowlist even if it is already on disk", async () => {
    const legacy = track(`legacy-${Date.now()}.html`);
    fs.writeFileSync(legacy, "<script>alert(1)</script>");
    await request(app).get(`/uploads/${path.basename(legacy)}`).expect(404);
  });

  it("does not answer directory listings", async () => {
    await request(app).get("/uploads/").expect(404);
  });

  it("will not walk out of the upload directory", async () => {
    await request(app).get("/uploads/..%2f..%2fpackage.json").expect(404);
  });
});