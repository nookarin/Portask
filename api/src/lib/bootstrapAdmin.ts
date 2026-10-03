import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { logger } from "./logger.js";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Creates the very first ADMIN account from ADMIN_EMAIL/ADMIN_PASSWORD when the
 * database has no admin yet. This is the only way an admin can come into
 * existence outside of an existing admin creating one via POST /api/users, and it
 * runs once on the first boot of the built image.
 *
 * Idempotent: if any ADMIN already exists this is a no-op, so restarting the stack
 * never re-provisions or resets credentials.
 */
export async function bootstrapAdmin(): Promise<void> {
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { email: true } });
  if (existingAdmin) {
    logger.info(`Admin bootstrap skipped, an admin already exists (${existingAdmin.email}).`);
    return;
  }

  const email = env.ADMIN_EMAIL?.trim();
  const password = env.ADMIN_PASSWORD;
  const name = env.ADMIN_NAME.trim();

  if (!email || !password) {
    throw new Error(
      "No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD before the first boot of the stack " +
        "(docker-compose.yml / .env) — the first admin is only ever created during image bootstrap."
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  const conflicting = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (conflicting) {
    throw new Error(`ADMIN_EMAIL ${email} is already used by a non-admin account. Pick another address.`);
  }

  const admin = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "ADMIN",
    },
    select: { email: true },
  });

  logger.info(`Created the initial admin account from ADMIN_EMAIL: ${admin.email}`);
}