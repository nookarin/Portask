import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth, requireManagement } from "../middleware/auth.js";

const router = Router();

/**
 * The internal staffing list: freelancers who have flagged themselves as available.
 *
 * This is the one place `bio` and `availableForWork` are read. Both fields are
 * write-only from the profile endpoint, so a user can never set them on somebody
 * else's account, and the list cannot be used to browse every account in the
 * workspace.
 */
router.get(
  "/",
  requireAuth,
  requireManagement,
  wrap(async (_req, res) => {
    const talent = await prisma.user.findMany({
      where: { role: "FREELANCER", availableForWork: true },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        bio: true,
        availableForWork: true,
        createdAt: true,
      },
    });
    res.json({ talent });
  })
);

export default router;
