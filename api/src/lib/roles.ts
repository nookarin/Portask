import type { Role } from "@prisma/client";

/**
 * The role groups the authorization guards are written against.
 *
 * These live in one file on purpose. Roles used to be compared inline
 * (`role === "ADMIN"`, `requireRole("ADMIN", "EMPLOYEE")`), which meant every new
 * role had to be remembered in a dozen places and a missed one silently granted or
 * revoked access. Naming the groups makes the permission model reviewable in one
 * screen, and `INTERNAL_ROLES`/`MANAGEMENT_ROLES` are the only two lists that need
 * updating when a role is added.
 */

/** Everyone who works inside the agency, whatever their seniority. */
export const INTERNAL_ROLES: Role[] = ["ADMIN", "MANAGER", "EMPLOYEE", "FREELANCER"];

/**
 * Internal roles that also run the agency: manage client companies, manage the team,
 * and delete projects. Everything else an internal role can do, they can do too.
 *
 * Deliberately excludes the agency owner: `/api/settings` and the first-admin
 * bootstrap stay ADMIN-only, and a manager cannot mint another admin (see users.ts).
 */
export const MANAGEMENT_ROLES: Role[] = ["ADMIN", "MANAGER"];

export function isInternal(role: Role): boolean {
  return INTERNAL_ROLES.includes(role);
}

export function isManagement(role: Role): boolean {
  return MANAGEMENT_ROLES.includes(role);
}