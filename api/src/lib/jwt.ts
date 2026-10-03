import jwt from "jsonwebtoken";
import { env } from "../env.js";
import type { Request } from "express";

export interface TokenPayload {
  sub: string;
  role: string;
}

export function signToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

export const COOKIE_NAME = "portask_token";

/**
 * `secure` is resolved in three steps:
 *
 * 1. `COOKIE_SECURE=true|false` always wins — an explicit operator override.
 * 2. Otherwise the flag follows the request: `Secure` in production only when the
 *    request arrived over HTTPS. `req.secure` is true for a direct TLS request and,
 *    with `TRUST_PROXY` set, for a plain request that a trusted proxy marked
 *    `X-Forwarded-Proto: https`.
 * 3. Development and test are never `Secure`, so plain-HTTP local setups work.
 *
 * Hard-coding `secure: NODE_ENV === "production"` is what breaks an http-only
 * deployment: browsers silently discard `Secure` cookies on `http://`, so login
 * returns 200 and every later request arrives unauthenticated.
 */
export function cookieOptions(req?: Pick<Request, "secure">): import("express").CookieOptions {
  const secure = env.COOKIE_SECURE ?? (env.NODE_ENV === "production" && req?.secure === true);
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}