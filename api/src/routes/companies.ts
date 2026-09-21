import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth, requireInternal } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(200),
});

router.get(
  "/",
  requireInternal,
  wrap(async (_req, res) => {
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { users: true, projects: true } },
      },
    });
    res.json(companies);
  })
);

router.post(
  "/",
  requireInternal,
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    const company = await prisma.company.create({ data: input });
    res.status(201).json(company);
  })
);

router.get(
  "/:id",
  requireInternal,
  wrap(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        users: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { projects: true } },
      },
    });
    if (!company) throw new ApiError(404, "Company not found.");
    res.json(company);
  })
);

router.put(
  "/:id",
  requireInternal,
  wrap(async (req, res) => {
    const input = createSchema.partial().parse(req.body);
    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: input,
    });
    res.json(company);
  })
);

export default router;