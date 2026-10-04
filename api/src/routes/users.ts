import { Router } from "express";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth, requireManagement } from "../middleware/auth.js";

const router = Router();
// Managers run the team as well as the owner. They still cannot mint an admin:
// see the escalation guard below.
router.use(requireAuth, requireManagement);

// Derived from the generated Prisma enum so a new role cannot be added to the schema
// and forgotten here, which would reject it at the API instead of creating it.
const createSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(Role).default("EMPLOYEE"),
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
    // A manager manages the team; promoting someone to the owner role is the one
    // power the agency owner keeps, otherwise "manage users" is an escalation to
    // admin by another name.
    if (req.user!.role === "MANAGER" && input.role === "ADMIN") {
      throw new ApiError(403, "Only an admin can create another admin.");
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