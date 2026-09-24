import { Router } from "express";
import { z } from "zod";
import { wrap } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { dbSettingsSchema, redactConnectionString } from "../lib/dbsettings.js";
import {
  getActiveDbStatus,
  getConfigPath,
  resetToDefault,
  switchDatabase,
  testDatabase,
} from "../db.js";

const applySchema = dbSettingsSchema.extend({ force: z.boolean().optional() });

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

router.get(
  "/",
  wrap(async (_req, res) => {
    const status = await getActiveDbStatus();
    res.json({ ...status, configPath: getConfigPath() });
  })
);

router.post(
  "/test",
  wrap(async (req, res) => {
    const input = dbSettingsSchema.parse(req.body);
    const resolved = await testDatabase(input);
    res.json({
      ok: true,
      provider: resolved.provider,
      label: resolved.label,
      connection: redactConnectionString(resolved.connectionString),
    });
  })
);

router.post(
  "/",
  wrap(async (req, res) => {
    const input = applySchema.parse(req.body);
    const { force, ...settings } = input;
    const status = await switchDatabase(settings, { force: force ?? false });
    res.json(status);
  })
);

router.post(
  "/reset",
  wrap(async (_req, res) => {
    const status = await resetToDefault();
    res.json(status);
  })
);

export default router;