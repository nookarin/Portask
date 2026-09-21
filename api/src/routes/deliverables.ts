import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth, requireInternal, requireProjectAccess } from "../middleware/auth.js";
import { logActivity, notify } from "../helpers/activity.js";
import { DeliverableStatus } from "@prisma/client";

export const projectDeliverablesRouter = Router();
projectDeliverablesRouter.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().optional(),
  fileUrl: z.string().optional().nullable(),
  deliveryLink: z.string().optional().nullable(),
});

projectDeliverablesRouter.get(
  "/:projectId/deliverables",
  wrap(async (req, res) => {
    await requireProjectAccess(req.user!, req.params.projectId);
    const deliverables = await prisma.deliverable.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: "desc" },
      include: {
        uploader: { select: { id: true, name: true, email: true, role: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
      },
    });
    res.json(deliverables);
  })
);

projectDeliverablesRouter.post(
  "/:projectId/deliverables",
  requireInternal,
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) throw new ApiError(404, "Project not found.");

    const deliverable = await prisma.deliverable.create({
      data: {
        name: input.name,
        description: input.description,
        fileUrl: input.fileUrl ?? null,
        deliveryLink: input.deliveryLink ?? null,
        status: DeliverableStatus.AWAITING_CLIENT_REVIEW,
        projectId: project.id,
        uploaderId: req.user!.id,
      },
      include: {
        uploader: { select: { id: true, name: true, email: true, role: true } },
        comments: { include: { author: { select: { id: true, name: true } } } },
      },
    });

    await logActivity(req.user!.id, project.id, "DELIVERABLE_UPLOADED", `Uploaded deliverable "${deliverable.name}"`);
    const clients = await prisma.user.findMany({ where: { companyId: project.companyId, role: "CLIENT" } });
    for (const client of clients) {
      await notify(client.id, `New deliverable on "${project.name}": ${deliverable.name} is awaiting your review`);
    }
    res.status(201).json(deliverable);
  })
);

export const deliverableRouter = Router();
deliverableRouter.use(requireAuth);

deliverableRouter.post(
  "/:id/approve",
  wrap(async (req, res) => {
    const deliverable = await prisma.deliverable.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!deliverable) throw new ApiError(404, "Deliverable not found.");
    await requireProjectAccess(req.user!, deliverable.projectId);

    const updated = await prisma.deliverable.update({
      where: { id: deliverable.id },
      data: { status: DeliverableStatus.APPROVED, feedback: null },
    });
    await logActivity(req.user!.id, deliverable.projectId, "DELIVERABLE_APPROVED", `Approved "${deliverable.name}"`);
    await notify(deliverable.uploaderId, `"${deliverable.name}" was approved 🎉`);
    res.json(updated);
  })
);

const changesSchema = z.object({ feedback: z.string().min(1) });

deliverableRouter.post(
  "/:id/request-changes",
  wrap(async (req, res) => {
    const deliverable = await prisma.deliverable.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!deliverable) throw new ApiError(404, "Deliverable not found.");
    await requireProjectAccess(req.user!, deliverable.projectId);

    const { feedback } = changesSchema.parse(req.body);
    const updated = await prisma.deliverable.update({
      where: { id: deliverable.id },
      data: { status: DeliverableStatus.CHANGES_REQUESTED, feedback },
    });
    await logActivity(
      req.user!.id,
      deliverable.projectId,
      "DELIVERABLE_CHANGES_REQUESTED",
      `Requested changes on "${deliverable.name}"`
    );
    await notify(deliverable.uploaderId, `Changes requested on "${deliverable.name}": ${feedback}`);
    res.json(updated);
  })
);

deliverableRouter.patch(
  "/:id",
  requireInternal,
  wrap(async (req, res) => {
    const deliverable = await prisma.deliverable.findUnique({ where: { id: req.params.id } });
    if (!deliverable) throw new ApiError(404, "Deliverable not found.");

    const input = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        fileUrl: z.string().optional().nullable(),
        deliveryLink: z.string().optional().nullable(),
      })
      .parse(req.body);

    const updated = await prisma.deliverable.update({
      where: { id: deliverable.id },
      data: input,
    });
    res.json(updated);
  })
);

export const deliverableCommentsRouter = Router();
deliverableCommentsRouter.use(requireAuth);

deliverableCommentsRouter.post(
  "/:deliverableId/comments",
  wrap(async (req, res) => {
    const deliverable = await prisma.deliverable.findUnique({
      where: { id: req.params.deliverableId },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!deliverable) throw new ApiError(404, "Deliverable not found.");
    await requireProjectAccess(req.user!, deliverable.projectId);

    const body = z.string().min(1).parse(req.body.body);
    const comment = await prisma.comment.create({
      data: { body, authorId: req.user!.id, deliverableId: deliverable.id },
      include: { author: { select: { id: true, name: true, role: true } } },
    });
    if (req.user!.id !== deliverable.uploaderId) {
      await notify(deliverable.uploaderId, `New comment on "${deliverable.name}"`);
    }
    res.status(201).json(comment);
  })
);