import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { wrap } from "../lib/errors.js";
import { requireInternal } from "../middleware/auth.js";

const uploadDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.post(
  "/",
  requireInternal,
  upload.single("file"),
  wrap(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname, size: req.file.size });
  })
);

export default router;