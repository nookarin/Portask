import { beforeEach, describe, expect, it, vi } from "vitest";

const envHolder: {
  NODE_ENV: string;
  COOKIE_SECURE?: boolean;
} = { NODE_ENV: "production" };
vi.mock("../src/env.js", () => ({ env: envHolder }));

const { cookieOptions } = await import("../src/lib/jwt.js");

const httpsReq = { secure: true };
const httpReq = { secure: false };

beforeEach(() => {
  envHolder.NODE_ENV = "production";
  envHolder.COOKIE_SECURE = undefined;
});

describe("cookieOptions secure flag", () => {
  it("marks the cookie Secure for an HTTPS request in production", () => {
    expect(cookieOptions(httpsReq).secure).toBe(true);
  });

  it("stays usable on a plain-HTTP production deployment instead of being silently dropped", () => {
    // The regression: a hard-coded `secure: NODE_ENV === "production"` makes the
    // browser discard the cookie on http://, so login "succeeds" and every
    // subsequent request is unauthenticated.
    expect(cookieOptions(httpReq).secure).toBe(false);
  });

  it("never sets Secure in development", () => {
    envHolder.NODE_ENV = "development";
    expect(cookieOptions(httpsReq).secure).toBe(false);
    expect(cookieOptions(httpReq).secure).toBe(false);
  });

  it("honours COOKIE_SECURE=false as an explicit override", () => {
    envHolder.COOKIE_SECURE = false;
    expect(cookieOptions(httpsReq).secure).toBe(false);
    expect(cookieOptions(httpReq).secure).toBe(false);
  });

  it("honours COOKIE_SECURE=true even when the request looks plain HTTP", () => {
    envHolder.COOKIE_SECURE = true;
    expect(cookieOptions(httpReq).secure).toBe(true);
    envHolder.NODE_ENV = "development";
    expect(cookieOptions(httpsReq).secure).toBe(true);
  });

  it("defaults to non-secure when called without a request", () => {
    expect(cookieOptions().secure).toBe(false);
    expect(cookieOptions(undefined).secure).toBe(false);
  });

  it("keeps the hardening flags regardless of transport", () => {
    const opts = cookieOptions(httpsReq);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });
});