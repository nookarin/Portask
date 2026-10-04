import rateLimit from "express-rate-limit";
import type { Request, RequestHandler } from "express";

const MINUTE = 60 * 1000;

export interface LimiterOptions {
  windowMs: number;
  limit: number;
  message: string;
  keyGenerator?: (req: Request) => string;
  /** Only count responses that failed (>= 400), so real users are not penalised. */
  skipSuccessfulRequests?: boolean;
  /** Requests for which the limiter is bypassed entirely. */
  skip?: (req: Request) => boolean;
}

/**
 * One configuration point for every throttle: RFC `RateLimit` standard headers, no
 * legacy `X-RateLimit-*` headers, and errors shaped like the rest of the API
 * (`{ "error": "..." }`) so the SPA surfaces them directly.
 *
 * Keys default to `req.ip`, which resolves to the real client address when
 * `TRUST_PROXY` matches the number of proxies in front of the API.
 */
export function createLimiter(options: LimiterOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: options.message },
    keyGenerator: options.keyGenerator,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    skip: options.skip,
  });
}

/** Normalised email so `A@B.com`, `a@b.com ` and `a@b.com` share one bucket. */
function accountKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : "unknown-email";
}

/** Per-connection ceiling for login, so password spraying across many accounts stops. */
export const loginIpLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  message: "Too many sign-in attempts from this connection. Try again in a few minutes.",
});

/** Per-account ceiling for *failed* logins, so one account cannot be brute-forced. */
export const loginAccountLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  message: "Too many failed sign-in attempts for this account. Try again in a few minutes.",
  keyGenerator: accountKey,
  skipSuccessfulRequests: true,
});

/** Public signup only, which is unauthenticated and hashes a password. */
export const registerLimiter = createLimiter({
  windowMs: 60 * MINUTE,
  limit: 10,
  message: "Too many accounts created from this connection. Try again later.",
});

/**
 * Backstop for the whole API so no single client can hammer the database. Deliberately
 * generous: it is not a substitute for the per-route limits above. Uploaded files are
 * excluded so a page with many assets cannot exhaust the budget.
 */
export const globalLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 1000,
  message: "Too many requests. Try again in a few minutes.",
  skip: (req) => req.path.startsWith("/uploads"),
});