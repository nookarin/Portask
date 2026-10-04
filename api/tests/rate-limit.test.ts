import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import type { Request, Response } from "express";
import { createLimiter } from "../src/lib/rateLimit.js";

let attempts = 0;

function buildApp(limit: number, opts: { skipSuccessfulRequests?: boolean; keyGenerator?: (req: Request) => string } = {}) {
  const app = express();
  app.use(express.json());
  app.post(
    "/test",
    createLimiter({
      windowMs: 60 * 1000,
      limit,
      message: "Too many requests from this connection. Try again later.",
      ...opts,
    }),
    (_req: Request, res: Response) => {
      attempts += 1;
      res.status(401).json({ error: "nope" });
    }
  );
  return app;
}

function buildSuccessApp(limit: number) {
  const app = express();
  app.use(express.json());
  let calls = 0;
  let succeed = true;
  app.post(
    "/test",
    createLimiter({ windowMs: 60 * 1000, limit, message: "Too many requests.", skipSuccessfulRequests: true }),
    (_req: Request, res: Response) => {
      calls += 1;
      if (calls > 2) succeed = false;
      res.status(succeed ? 200 : 401).json(succeed ? { ok: true } : { error: "nope" });
    }
  );
  return app;
}

beforeEach(() => {
  attempts = 0;
});

describe("createLimiter", () => {
  it("allows requests up to the limit and blocks the next one with 429", async () => {
    const app = buildApp(2);
    await request(app).post("/test").expect(401);
    await request(app).post("/test").expect(401);

    const blocked = await request(app).post("/test").expect(429);
    expect(blocked.body).toEqual({ error: "Too many requests from this connection. Try again later." });
    expect(attempts).toBe(2);
  });

  it("sends RateLimit standard headers and no legacy ones", async () => {
    const app = buildApp(1);
    const first = await request(app).post("/test").expect(401);
    expect(first.headers["ratelimit-limit"]).toBe("1");
    expect(first.headers["ratelimit-remaining"]).toBe("0");
    expect(first.headers["x-ratelimit-limit"]).toBeUndefined();

    const blocked = await request(app).post("/test").expect(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("counts failed responses only when skipSuccessfulRequests is set", async () => {
    const app = buildSuccessApp(2);
    // The two 200s must not consume the budget; only the 401s do.
    await request(app).post("/test").expect(200);
    await request(app).post("/test").expect(200);
    await request(app).post("/test").expect(401);
    await request(app).post("/test").expect(401);
    await request(app).post("/test").expect(429);
  });

  it("keeps separate buckets per key", async () => {
    const app = buildApp(1, { keyGenerator: (req) => String((req.body as { id?: string }).id ?? "anon") });

    await request(app).post("/test").send({ id: "a" }).expect(401);
    await request(app).post("/test").send({ id: "b" }).expect(401);
    await request(app).post("/test").send({ id: "a" }).expect(429);
    await request(app).post("/test").send({ id: "b" }).expect(429);
  });

  it("bypasses skipped requests entirely", async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/test",
      createLimiter({ windowMs: 60 * 1000, limit: 1, message: "Too many requests.", skip: (req) => req.path === "/test" }),
      (_req, res) => res.status(200).json({ ok: true })
    );
    for (let i = 0; i < 5; i += 1) await request(app).post("/test").expect(200);
  });
});