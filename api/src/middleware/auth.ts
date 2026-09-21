import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { COOKIE_NAME, verifyToken } from "../lib/jwt.js";
import type { RequestHandler, Request } from "express";
import type { Role } from "@prisma/client";

export const requireAuth: RequestHandler = wrap(async (req, _res, next) => {
  const token = (req.cookies as Record<string, string>)?.[COOKIE_NAME];
  if (!token) throw new ApiError(401, "Not authenticated.");

  const payload = verifyToken(token);
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { company: true },
  });
  if (!user) throw new ApiError(401, "User no longer exists.");

  req.user = user;
  next();
});

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw new ApiError(401, "Not authenticated.");
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, "Insufficient permissions.");
    }
    next();
  };

export const requireInternal: RequestHandler =
  requireRole("ADMIN", "EMPLOYEE");

export async function canAccessProject(user: NonNullable<Request["user"]>, projectId: string): Promise<boolean> {
  if (user.role === "ADMIN" || user.role === "EMPLOYEE") return true;
  if (user.role === "CLIENT") {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { companyId: true },
    });
    return project?.companyId === user.companyId;
  }
  return false;
}

export async function requireProjectAccess(
  user: NonNullable<Request["user"]>,
  projectId: string
): Promise<void> {
  const allowed = await canAccessProject(user, projectId);
  if (!allowed) throw new ApiError(403, "You do not have access to this project.");
}