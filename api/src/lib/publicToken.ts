import crypto from "node:crypto";

const TOKEN_BYTES = 24;

export function generatePublicToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isValidTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/**
 * Resolve a public token to a live report. Revoked, expired and malformed
 * tokens are all reported as "not found" so the endpoint never confirms
 * whether a token exists.
 */
export async function resolvePublicReport<T extends {
  id: string;
  enabled: boolean;
  expiresAt: Date | null;
}>(token: string, lookup: (token: string) => Promise<T | null>): Promise<T | null> {
  if (!isValidTokenFormat(token)) return null;

  const report = await lookup(token);
  if (!report) return null;
  if (!report.enabled) return null;
  if (report.expiresAt && report.expiresAt.getTime() <= Date.now()) return null;
  return report;
}

export function rateLimitKey(ip: string, token: string): string {
  return `${ip}:${token}`;
}