import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth, requireInternal, requireProjectAccess } from "../middleware/auth.js";
import { logActivity } from "../helpers/activity.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(300),
  dueDate: z.string().datetime().optional().nullable(),
});

router.get(
  "/:projectId/milestones",
  wrap(async (req, res) => {
    await requireProjectAccess(req.user!, req.params.projectId);
    const milestones = await prisma.milestone.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: "asc" },
    });
    res.json(milestones);
  })
);

router.post(
  "/:projectId/milestones",
  requireInternal,
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) throw new ApiError(404, "Project not found.");

    const milestone = await prisma.milestone.create({
      data: {
        name: input.name,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        projectId: project.id,
      },
    });
    await logActivity(req.user!.id, project.id, "MILESTONE_CREATED", `Added milestone "${milestone.name}"`);
    res.status(201).json(milestone);
  })
);

export default router;