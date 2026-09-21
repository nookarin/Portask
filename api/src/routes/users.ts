import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

const createSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "EMPLOYEE", "CLIENT"]).default("EMPLOYEE"),
  companyId: z.string().optional(),
});

router.get(
  "/",
  wrap(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { company: { select: { id: true, name: true } } },
    });
    res.json(users);
  })
);

router.post(
  "/",
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    if (input.role === "CLIENT" && !input.companyId) {
      throw new ApiError(400, "Client accounts must belong to a company.");
    }
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ApiError(409, "An account with this email already exists.");

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        companyId: input.companyId,
      },
      include: { company: { select: { id: true, name: true } } },
    });
    res.status(201).json({ user });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    if (req.user!.id === req.params.id) {
      throw new ApiError(400, "You cannot delete your own account.");
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

export default router;