import { Router } from "express";
import { prisma } from "../db.js";
import { wrap } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  wrap(async (req, res) => {
    const user = req.user!;
    const isClient = user.role === "CLIENT";

    const projectWhere = isClient ? { companyId: user.companyId ?? "__none__" } : {};
    const now = new Date();
    const in7days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [activeProjects, riskProjects, blockedTasks, pendingDeliverables, recentUpdates, recentActivity] =
      await Promise.all([
        prisma.project.count({ where: { ...projectWhere, status: { in: ["ACTIVE", "PLANNING"] } } }),
        prisma.project.count({
          where: {
            ...projectWhere,
            status: "ACTIVE",
            OR: [{ dueDate: { lt: now } }, { dueDate: { lt: in7days }, progress: { lt: 100 } }],
          },
        }),
        prisma.task.count({ where: { ...(isClient ? {} : {}), status: "BLOCKED", ...(isClient ? { project: projectWhere } : {}) } }),
        prisma.deliverable.count({ where: { status: "AWAITING_CLIENT_REVIEW", ...(isClient ? { project: projectWhere } : {}) } }),
        prisma.projectUpdate.findMany({
          where: isClient ? { visibility: "CLIENT", project: projectWhere } : {},
          orderBy: { createdAt: "desc" },
          take: 8,
          include: {
            project: { select: { id: true, name: true } },
            author: { select: { id: true, name: true } },
          },
        }),
        isClient
          ? prisma.project.findMany({
              where: projectWhere,
              orderBy: { updatedAt: "desc" },
              take: 5,
              include: {
                activityLogs: { orderBy: { createdAt: "desc" }, take: 3, include: { user: { select: { id: true, name: true, role: true } } } },
              },
            })
          : prisma.activityLog.findMany({
              orderBy: { createdAt: "desc" },
              take: 10,
              include: {
                project: { select: { id: true, name: true } },
                user: { select: { id: true, name: true, role: true } },
              },
            }),
      ]);

    const myTasks =
      user.role === "EMPLOYEE" || user.role === "ADMIN"
        ? await prisma.task.findMany({
            where: { assigneeId: user.id },
            orderBy: { updatedAt: "desc" },
            take: 10,
            include: { project: { select: { id: true, name: true } } },
          })
        : [];

    const tasksDueSoon = myTasks.filter(
      (t) => t.status !== "DONE" && t.dueDate && t.dueDate <= in7days
    );

    const blockedMyTasks = myTasks.filter((t) => t.status === "BLOCKED");

    const upcomingMilestones =
      user.role === "CLIENT" || user.role === "ADMIN"
        ? await prisma.milestone.findMany({
            where: { ...(isClient ? { project: projectWhere } : {}), dueDate: { gte: now } },
            orderBy: { dueDate: "asc" },
            take: 5,
            include: { project: { select: { id: true, name: true } } },
          })
        : [];

    res.json({
      counts: {
        activeProjects,
        riskProjects,
        blockedTasks,
        pendingDeliverables,
      },
      recentUpdates,
      recentActivity,
      myTasks,
      tasksDueSoon,
      blockedMyTasks,
      upcomingMilestones,
    });
  })
);

export default router;