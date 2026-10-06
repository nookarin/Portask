import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth, requireInternal } from "../middleware/auth.js";
import { generatePublicToken, hashIp, resolvePublicReport } from "../lib/publicToken.js";
import { notify } from "../helpers/activity.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireInternal);

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(200),
  intro: z.string().max(5000).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  intro: z.string().max(5000).optional().nullable(),
  enabled: z.boolean().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const curationSchema = z.object({
  updateIds: z.array(z.string()).max(200).optional(),
  deliverableIds: z.array(z.string()).max(200).optional(),
});

reportsRouter.get(
  "/",
  wrap(async (req, res) => {
    const reports = await prisma.progressReport.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { updates: true, deliverables: true, comments: true } },
      },
    });
    res.json(reports);
  })
);

reportsRouter.get(
  "/:reportId",
  wrap(async (req, res) => {
    const report = await prisma.progressReport.findUnique({
      where: { id: req.params.reportId },
      include: {
        project: { select: { id: true, name: true } },
        updates: {
          include: {
            update: {
              select: { id: true, title: true, body: true, progress: true, fileUrl: true, createdAt: true },
            },
          },
        },
        deliverables: {
          include: {
            deliverable: {
              select: { id: true, name: true, description: true, fileUrl: true, status: true, createdAt: true },
            },
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, authorName: true, body: true, status: true, createdAt: true },
        },
      },
    });
    if (!report) throw new ApiError(404, "Report not found.");

    const project = await prisma.project.findUnique({
      where: { id: report.projectId },
      select: { updates: { select: { id: true, title: true, visibility: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        deliverables: { select: { id: true, name: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } } },
    });

    res.json({
      ...report,
      availableUpdates: project?.updates ?? [],
      availableDeliverables: project?.deliverables ?? [],
    });
  })
);

reportsRouter.post(
  "/",
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new ApiError(404, "Project not found.");

    let token = generatePublicToken();
    while (await prisma.progressReport.findUnique({ where: { token }, select: { id: true } })) {
      token = generatePublicToken();
    }

    const report = await prisma.progressReport.create({
      data: {
        title: input.title,
        intro: input.intro ?? null,
        token,
        projectId: project.id,
        createdById: req.user!.id,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
      include: { project: { select: { id: true, name: true } } },
    });
    res.status(201).json(report);
  })
);

reportsRouter.patch(
  "/:reportId",
  wrap(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.progressReport.findUnique({ where: { id: req.params.reportId } });
    if (!existing) throw new ApiError(404, "Report not found.");

    const updated = await prisma.progressReport.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.intro !== undefined ? { intro: input.intro } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
          : {}),
      },
    });
    res.json(updated);
  })
);

reportsRouter.put(
  "/:reportId/curation",
  wrap(async (req, res) => {
    const input = curationSchema.parse(req.body);
    const report = await prisma.progressReport.findUnique({ where: { id: req.params.reportId } });
    if (!report) throw new ApiError(404, "Report not found.");

    const updateIds = input.updateIds ?? [];
    const deliverableIds = input.deliverableIds ?? [];

    const scopedUpdates = await prisma.projectUpdate.findMany({
      where: { id: { in: updateIds }, projectId: report.projectId },
      select: { id: true, visibility: true },
    });
    if (scopedUpdates.length !== new Set(updateIds).size) {
      throw new ApiError(400, "One or more updates do not belong to this project.");
    }
    const internal = scopedUpdates.filter((u) => u.visibility === "INTERNAL");
    if (internal.length > 0) {
      throw new ApiError(400, "Internal updates cannot be published to a public report.");
    }

    const scopedDeliverables = await prisma.deliverable.findMany({
      where: { id: { in: deliverableIds }, projectId: report.projectId },
      select: { id: true },
    });
    if (scopedDeliverables.length !== new Set(deliverableIds).size) {
      throw new ApiError(400, "One or more deliverables do not belong to this project.");
    }

    await prisma.$transaction([
      prisma.reportUpdate.deleteMany({ where: { reportId: report.id } }),
      prisma.reportDeliverable.deleteMany({ where: { reportId: report.id } }),
      ...updateIds.map((updateId) => prisma.reportUpdate.create({ data: { reportId: report.id, updateId } })),
      ...deliverableIds.map((deliverableId) =>
        prisma.reportDeliverable.create({ data: { reportId: report.id, deliverableId } })
      ),
    ]);

    const updated = await prisma.progressReport.findUniqueOrThrow({
      where: { id: report.id },
      include: { _count: { select: { updates: true, deliverables: true } } },
    });
    res.json(updated);
  })
);

reportsRouter.get(
  "/:reportId/comments",
  wrap(async (req, res) => {
    const report = await prisma.progressReport.findUnique({ where: { id: req.params.reportId } });
    if (!report) throw new ApiError(404, "Report not found.");
    const comments = await prisma.publicComment.findMany({
      where: { reportId: report.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, authorName: true, body: true, status: true, createdAt: true },
    });
    res.json(comments);
  })
);

const moderationSchema = z.object({ status: z.enum(["APPROVED", "SPAM", "PENDING"]) });

reportsRouter.patch(
  "/:reportId/comments/:commentId",
  wrap(async (req, res) => {
    const { status } = moderationSchema.parse(req.body);
    const comment = await prisma.publicComment.findFirst({
      where: { id: req.params.commentId, reportId: req.params.reportId },
    });
    if (!comment) throw new ApiError(404, "Comment not found.");
    const updated = await prisma.publicComment.update({
      where: { id: comment.id },
      data: { status },
      select: { id: true, authorName: true, body: true, status: true, createdAt: true },
    });
    res.json(updated);
  })
);

reportsRouter.delete(
  "/:reportId/comments/:commentId",
  wrap(async (req, res) => {
    const comment = await prisma.publicComment.findFirst({
      where: { id: req.params.commentId, reportId: req.params.reportId },
      select: { id: true },
    });
    if (!comment) throw new ApiError(404, "Comment not found.");
    await prisma.publicComment.delete({ where: { id: comment.id } });
    res.json({ ok: true });
  })
);

export const publicReportsRouter = Router();

const PUBLIC_COMMENT_LIMIT = 5;
const PUBLIC_COMMENT_WINDOW_MS = 60 * 60 * 1000;

const publicCommentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many comments from this connection. Try again later." },
  // Tests reuse one IP across the whole file, so this per-IP budget would throttle
  // unrelated cases. The per-report, per-IP-hour limit below still returns 429.
  skip: () => env.NODE_ENV === "test",
});

const publicViewLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

publicReportsRouter.get("/:token", publicViewLimiter, wrap(async (req, res) => {
  const report = await resolvePublicReport(req.params.token, (token) =>
    prisma.progressReport.findUnique({ where: { token } })
  );
  if (!report) throw new ApiError(404, "This report is not available.");

  const full = await prisma.progressReport.findUniqueOrThrow({
    where: { id: report.id },
    include: {
      project: { select: { name: true, status: true, startDate: true, dueDate: true, progress: true } },
      updates: {
        orderBy: { update: { createdAt: "desc" } },
        include: {
          update: {
            select: { id: true, title: true, body: true, progress: true, fileUrl: true, createdAt: true, visibility: true },
          },
        },
      },
      deliverables: {
        include: {
          deliverable: {
            select: { id: true, name: true, description: true, fileUrl: true, status: true, createdAt: true },
          },
        },
      },
      comments: {
        where: { status: "APPROVED" },
        orderBy: { createdAt: "asc" },
        select: { id: true, authorName: true, body: true, createdAt: true },
      },
    },
  });

  res.set("X-Robots-Tag", "noindex, nofollow");
  res.json({
    title: full.title,
    intro: full.intro,
    project: full.project,
    updates: full.updates
      .filter((u) => u.update.visibility === "CLIENT")
      .map(({ update: { visibility: _visibility, ...rest } }) => rest),
    deliverables: full.deliverables.map(({ deliverable }) => deliverable),
    comments: full.comments,
    updatedAt: full.updatedAt,
  });
}));

const commentSchema = z.object({
  authorName: z.string().min(1).max(80),
  body: z.string().min(1).max(2000),
});

publicReportsRouter.post("/:token/comments", publicCommentLimiter, wrap(async (req, res) => {
  const report = await resolvePublicReport(req.params.token, (token) =>
    prisma.progressReport.findUnique({ where: { token } })
  );
  if (!report) throw new ApiError(404, "This report is not available.");

  const input = commentSchema.parse(req.body);
  const ipHash = hashIp(req.ip ?? "unknown");

  const recent = await prisma.publicComment.count({
    where: {
      reportId: report.id,
      ipHash,
      createdAt: { gte: new Date(Date.now() - PUBLIC_COMMENT_WINDOW_MS) },
    },
  });
  if (recent >= PUBLIC_COMMENT_LIMIT) {
    throw new ApiError(429, "Too many comments. Try again later.");
  }

  const comment = await prisma.publicComment.create({
    data: {
      reportId: report.id,
      authorName: input.authorName,
      body: input.body,
      ipHash,
      status: "PENDING",
    },
    select: { id: true, authorName: true, body: true, status: true, createdAt: true },
  });

  await notify(report.createdById, `New public comment on "${report.title}" is awaiting review`);
  res.status(201).json(comment);
}));