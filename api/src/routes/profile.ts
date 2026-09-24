import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { sanitizeUser } from "./auth.js";

const router = Router();

const updateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    avatarUrl: z.string().max(1000).nullable().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8).optional(),
  })
  .refine((data) => !data.newPassword || data.currentPassword, {
    message: "Your current password is required to change it.",
    path: ["currentPassword"],
  });

router.get(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    res.json({ user: sanitizeUser(req.user!) });
  })
);

router.patch(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const current = req.user!;

    const data: { name?: string; avatarUrl?: string | null; passwordHash?: string } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;

    if (input.newPassword) {
      const valid = await bcrypt.compare(input.currentPassword!, current.passwordHash);
      if (!valid) throw new ApiError(401, "Your current password is incorrect.");
      data.passwordHash = await bcrypt.hash(input.newPassword, 10);
    }

    const user = await prisma.user.update({
      where: { id: current.id },
      data,
      include: { company: true },
    });

    res.json({ user: sanitizeUser(user as typeof current) });
  })
);

export default router;