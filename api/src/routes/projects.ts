import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import {
  requireAuth,
  requireInternal,
  requireRole,
  requireProjectAccess,
} from "../middleware/auth.js";
import { logActivity } from "../helpers/activity.js";
import { Prisma, ProjectStatus } from "@prisma/client";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  companyId: z.string().min(1),
  status: z.enum(Object.values(ProjectStatus) as [string]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  progress: z.number().int().min(0).max(100).optional(),
});

router.get(
  "/",
  wrap(async (req, res) => {
    const q = req.query.q as string | undefined;
    const status = req.query.status as ProjectStatus | undefined;

    const where: Prisma.ProjectWhereInput = {};
    if (req.user!.role === "CLIENT") where.companyId = req.user!.companyId ?? "";
    if (q) where.name = { contains: q, mode: "insensitive" };
    if (status) where.status = status;

    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        company: { select: { id: true, name: true } },
        members: { select: { user: { select: { id: true, name: true, email: true, role: true } } } },
        _count: { select: { tasks: true, deliverables: true, updates: true } },
      },
    });
    res.json(projects);
  })
);

router.post(
  "/",
  requireInternal,
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    const company = await prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company) throw new ApiError(404, "Company not found.");

    const project = await prisma.project.create({
      data: {
        name: input.name,
        description: input.description,
        companyId: input.companyId,
        status: (input.status as ProjectStatus) ?? ProjectStatus.ACTIVE,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        progress: input.progress,
      },
      include: { company: true },
    });

    await logActivity(req.user!.id, project.id, "PROJECT_CREATED", `Created project "${project.name}"`);
    res.status(201).json(project);
  })
);

router.get(
  "/:id",
  wrap(async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        company: true,
        members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        tasks: {
          orderBy: { createdAt: "asc" },
          include: { assignee: { select: { id: true, name: true, email: true } } },
        },
        milestones: { orderBy: { createdAt: "asc" } },
        updates: {
          orderBy: { createdAt: "desc" },
          include: {
            author: { select: { id: true, name: true, email: true, role: true } },
            comments: { include: { author: { select: { id: true, name: true, role: true } } } },
          },
        },
        deliverables: {
          orderBy: { createdAt: "desc" },
          include: {
            uploader: { select: { id: true, name: true, email: true, role: true } },
            comments: { include: { author: { select: { id: true, name: true, role: true } } } },
          },
        },
        activityLogs: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { user: { select: { id: true, name: true, role: true } } },
        },
      },
    });
    if (!project) throw new ApiError(404, "Project not found.");

    await requireProjectAccess(req.user!, project.id);

    const isClient = req.user!.role === "CLIENT";
    const filtered = {
      ...project,
      updates: isClient ? project.updates.filter((u) => u.visibility === "CLIENT") : project.updates,
      tasks: isClient ? project.tasks.filter((t) => t.clientVisible) : project.tasks,
    };
    res.json(filtered);
  })
);

router.put(
  "/:id",
  requireInternal,
  wrap(async (req, res) => {
    const input = createSchema.partial().parse(req.body);
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status ? { status: input.status as ProjectStatus } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
        ...(input.progress !== undefined ? { progress: input.progress } : {}),
      },
    });
    await logActivity(req.user!.id, project.id, "PROJECT_UPDATED", `Updated project "${project.name}"`);
    res.json(project);
  })
);

router.delete(
  "/:id",
  requireRole("ADMIN"),
  wrap(async (req, res) => {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/members",
  requireInternal,
  wrap(async (req, res) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) throw new ApiError(404, "Project not found.");

    const userId = z.string().parse(req.body.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, "User not found.");

    const membership = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId } },
      update: {},
      create: { projectId: project.id, userId },
    });
    await logActivity(req.user!.id, project.id, "MEMBER_ADDED", `Added ${user.name} to the project`);
    res.status(201).json(membership);
  })
);

router.delete(
  "/:id/members/:userId",
  requireInternal,
  wrap(async (req, res) => {
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } },
    });
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    await logActivity(req.user!.id, req.params.id, "MEMBER_REMOVED", `Removed ${user?.name ?? "a member"} from the project`);
    res.json({ ok: true });
  })
);

router.get(
  "/:id/activity",
  wrap(async (req, res) => {
    await requireProjectAccess(req.user!, req.params.id);
    const logs = await prisma.activityLog.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    res.json(logs);
  })
);

export default router;