import { Router } from "express";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  wrap(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(notifications);
  })
);

router.post(
  "/:id/read",
  wrap(async (req, res) => {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!notification) throw new ApiError(404, "Notification not found.");
    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { read: true },
    });
    res.json(updated);
  })
);

router.post(
  "/read-all",
  wrap(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, read: false },
      data: { read: true },
    });
    res.json({ count: result.count });
  })
);

export default router;