import jwt from "jsonwebtoken";
import { env } from "../env.js";

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

export function cookieOptions(): import("express").CookieOptions {
  const secure = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}