import { Router } from "express";
import { prisma } from "../db.js";
import { wrap } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

export type CalendarEventType = "TASK" | "MILESTONE" | "PROJECT";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string;
  projectId: string;
  projectName: string;
  status?: string;
  priority?: string;
  assigneeName?: string | null;
}

function defaultStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function defaultEnd(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

router.get(
  "/",
  wrap(async (req, res) => {
    const user = req.user!;
    const isClient = user.role === "CLIENT";
    const startDate = parseDate(typeof req.query.start === "string" ? req.query.start : undefined) ?? defaultStart();
    const endDate = parseDate(typeof req.query.end === "string" ? req.query.end : undefined) ?? defaultEnd();

    const projectWhere = isClient ? { companyId: user.companyId ?? "__none__" } : {};

    const [tasks, milestones, projects] = await Promise.all([
      prisma.task.findMany({
        where: {
          dueDate: { gte: startDate, lte: endDate },
          ...(isClient ? { clientVisible: true, project: projectWhere } : {}),
        },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
        },
      }),
      prisma.milestone.findMany({
        where: {
          dueDate: { gte: startDate, lte: endDate },
          ...(isClient ? { project: projectWhere } : {}),
        },
        include: { project: { select: { id: true, name: true } } },
      }),
      prisma.project.findMany({
        where: {
          ...projectWhere,
          OR: [
            { startDate: { gte: startDate, lte: endDate } },
            { dueDate: { gte: startDate, lte: endDate } },
          ],
        },
        select: { id: true, name: true, startDate: true, dueDate: true },
      }),
    ]);

    const events: CalendarEvent[] = [
      ...tasks.map((t) => ({
        id: `task-${t.id}`,
        type: "TASK" as const,
        title: t.title,
        date: t.dueDate!.toISOString(),
        projectId: t.projectId,
        projectName: t.project.name,
        status: t.status,
        priority: t.priority,
        assigneeName: t.assignee?.name ?? null,
      })),
      ...milestones.map((m) => ({
        id: `milestone-${m.id}`,
        type: "MILESTONE" as const,
        title: m.name,
        date: m.dueDate!.toISOString(),
        projectId: m.projectId,
        projectName: m.project.name,
      })),
      ...projects.flatMap((p) => {
        const output: CalendarEvent[] = [];
        if (p.startDate) {
          output.push({
            id: `project-start-${p.id}`,
            type: "PROJECT",
            title: `${p.name} starts`,
            date: p.startDate.toISOString(),
            projectId: p.id,
            projectName: p.name,
          });
        }
        if (p.dueDate) {
          output.push({
            id: `project-due-${p.id}`,
            type: "PROJECT",
            title: `${p.name} due`,
            date: p.dueDate.toISOString(),
            projectId: p.id,
            projectName: p.name,
          });
        }
        return output;
      }),
    ];

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    res.json(events);
  })
);

export default router;