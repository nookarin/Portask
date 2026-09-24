import { Router } from "express";
import { pingActiveDb } from "../db.js";

const router = Router();

router.get("/", async (_req, res) => {
  let db = "down";
  try {
    await pingActiveDb();
    db = "up";
  } catch {
    db = "down";
  }
  res.json({
    status: db === "up" ? "ok" : "degraded",
    db,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;