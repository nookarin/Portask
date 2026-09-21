import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth, requireInternal, requireProjectAccess } from "../middleware/auth.js";
import { logActivity, notify } from "../helpers/activity.js";
import { Priority, TaskStatus } from "@prisma/client";

export const projectTasksRouter = Router();
projectTasksRouter.use(requireAuth);

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  status: z.enum(Object.values(TaskStatus) as [string]).optional(),
  priority: z.enum(Object.values(Priority) as [string]).optional(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  clientVisible: z.boolean().optional(),
});

projectTasksRouter.get(
  "/:projectId/tasks",
  wrap(async (req, res) => {
    await requireProjectAccess(req.user!, req.params.projectId);
    const tasks = await prisma.task.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: "asc" },
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });
    if (req.user!.role === "CLIENT") {
      res.json(tasks.filter((t) => t.clientVisible));
      return;
    }
    res.json(tasks);
  })
);

projectTasksRouter.post(
  "/:projectId/tasks",
  requireInternal,
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) throw new ApiError(404, "Project not found.");

    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        projectId: project.id,
        status: (input.status as TaskStatus) ?? TaskStatus.TO_DO,
        priority: (input.priority as Priority) ?? Priority.MEDIUM,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        clientVisible: input.clientVisible ?? false,
      },
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });

    await logActivity(req.user!.id, project.id, "TASK_CREATED", `Created task "${task.title}"`);
    if (task.assigneeId) {
      await notify(task.assigneeId, `You were assigned "${task.title}"`);
    }
    res.status(201).json(task);
  })
);

export const taskRouter = Router();
taskRouter.use(requireAuth);

const updateSchema = createSchema.partial();

taskRouter.patch(
  "/:id",
  wrap(async (req, res) => {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!task) throw new ApiError(404, "Task not found.");
    await requireProjectAccess(req.user!, task.projectId);

    const input = updateSchema.parse(req.body);

    const updates: Record<string, unknown> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.priority) updates.priority = input.priority as Priority;
    if (input.status) updates.status = input.status as TaskStatus;
    if (input.assigneeId !== undefined) updates.assigneeId = input.assigneeId;
    if (input.dueDate !== undefined) updates.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.clientVisible !== undefined) updates.clientVisible = input.clientVisible;

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: updates,
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });

    if (input.status && input.status !== task.status) {
      await logActivity(
        req.user!.id,
        task.projectId,
        "TASK_STATUS_CHANGED",
        `"${task.title}" moved to ${formatTaskStatus(input.status as TaskStatus)}`
      );
    }
    if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
      await logActivity(req.user!.id, task.projectId, "TASK_ASSIGNED", `"${task.title}" was (re)assigned`);
      if (input.assigneeId) {
        await notify(input.assigneeId, `You were assigned "${task.title}"`);
      }
    }

    res.json(updated);
  })
);

taskRouter.delete(
  "/:id",
  requireInternal,
  wrap(async (req, res) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw new ApiError(404, "Task not found.");
    await prisma.task.delete({ where: { id: task.id } });
    await logActivity(req.user!.id, task.projectId, "TASK_DELETED", `Deleted task "${task.title}"`);
    res.json({ ok: true });
  })
);

function formatTaskStatus(s: TaskStatus): string {
  return { TO_DO: "To Do", IN_PROGRESS: "In Progress", BLOCKED: "Blocked", DONE: "Done" }[s];
}