import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth, requireInternal, requireProjectAccess } from "../middleware/auth.js";
import { logActivity, notify } from "../helpers/activity.js";
import { UpdateVisibility } from "@prisma/client";

export const projectUpdatesRouter = Router();
projectUpdatesRouter.use(requireAuth);

const createSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1),
  progress: z.number().int().min(0).max(100).optional(),
  visibility: z.enum(Object.values(UpdateVisibility) as [string]).default("CLIENT"),
  fileUrl: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
});

projectUpdatesRouter.get(
  "/:projectId/updates",
  wrap(async (req, res) => {
    await requireProjectAccess(req.user!, req.params.projectId);
    const updates = await prisma.projectUpdate.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
      },
    });
    const filtered =
      req.user!.role === "CLIENT" ? updates.filter((u) => u.visibility === "CLIENT") : updates;
    res.json(filtered);
  })
);

projectUpdatesRouter.post(
  "/:projectId/updates",
  requireInternal,
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) throw new ApiError(404, "Project not found.");

    const update = await prisma.projectUpdate.create({
      data: {
        title: input.title,
        body: input.body,
        progress: input.progress ?? project.progress,
        visibility: (input.visibility as UpdateVisibility) ?? UpdateVisibility.CLIENT,
        fileUrl: input.fileUrl ?? null,
        taskId: input.taskId ?? null,
        projectId: project.id,
        authorId: req.user!.id,
      },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
        comments: { include: { author: { select: { id: true, name: true } } } },
      },
    });

    if (update.progress > project.progress) {
      await prisma.project.update({
        where: { id: project.id },
        data: { progress: update.progress },
      });
    }
    await logActivity(req.user!.id, project.id, "UPDATE_POSTED", `Posted update "${update.title}"`);

    if (update.visibility === "CLIENT") {
      const clients = await prisma.user.findMany({ where: { companyId: project.companyId, role: "CLIENT" } });
      for (const client of clients) {
        await notify(client.id, `New update on "${project.name}": ${update.title}`);
      }
    }
    res.status(201).json(update);
  })
);

export const updateCommentsRouter = Router();
updateCommentsRouter.use(requireAuth);

updateCommentsRouter.post(
  "/:updateId/comments",
  wrap(async (req, res) => {
    const update = await prisma.projectUpdate.findUnique({
      where: { id: req.params.updateId },
      include: { project: { select: { id: true, companyId: true } } },
    });
    if (!update) throw new ApiError(404, "Update not found.");
    await requireProjectAccess(req.user!, update.projectId);

    const body = z.string().min(1).parse(req.body.body);
    const comment = await prisma.comment.create({
      data: { body, authorId: req.user!.id, updateId: update.id },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    if (req.user!.id !== update.authorId) {
      await notify(update.authorId, `New comment on "${update.title}"`);
    }
    await logActivity(req.user!.id, update.projectId, "COMMENT_ADDED", `Commented on update "${update.title}"`);
    res.status(201).json(comment);
  })
);