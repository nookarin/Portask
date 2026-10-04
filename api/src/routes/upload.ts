import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import express, { Router } from "express";
import type { RequestHandler } from "express";
import multer from "multer";
import { ApiError, wrap } from "../lib/errors.js";
import { notFound } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";

const uploadDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

/**
 * The uploads an instance will accept and serve, keyed by the extension it stores.
 *
 * Files are served from the app's own origin at `/uploads`, so an upload is an attack
 * on whoever opens the link rather than only on the uploader: anything a browser
 * renders as a document there runs with the visitor's cookies attached and can issue
 * same-origin requests as them. Public progress reports hand these URLs to anonymous
 * visitors, so `/uploads` cannot require a session and has to be safe by construction.
 *
 * Raster images and PDF only. SVG and HTML are excluded on purpose — a browser
 * executes script in both when they are opened directly. PDF is served as a download
 * so it opens in the browser's viewer instead of in a tab on our origin.
 *
 * The client's declared Content-Type is deliberately not consulted: it is supplied by
 * whoever is uploading, so it proves nothing. The response type comes from this table
 * via the stored extension instead, which is why a `.html` payload renamed to `.png`
 * is still handed back as `image/png` with `nosniff` and is never parsed as a document.
 */
const ALLOWED_TYPES: Record<string, "inline" | "attachment"> = {
  ".png": "inline",
  ".jpg": "inline",
  ".jpeg": "inline",
  ".gif": "inline",
  ".webp": "inline",
  ".avif": "inline",
  ".pdf": "attachment",
};

const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_TYPES).join(", ");

function dispositionFor(name: string): "inline" | "attachment" | undefined {
  return ALLOWED_TYPES[path.extname(name).toLowerCase()];
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    // fileFilter has already rejected everything else, so this extension comes from
    // ALLOWED_TYPES rather than from the client.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  // Runs before the body is written, so a rejected file never reaches the disk.
  fileFilter: (_req, file, cb) => {
    if (!dispositionFor(file.originalname)) {
      cb(new ApiError(400, `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS}.`));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.post(
  "/",
  requireAuth,
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

// Enforced on the way out as well as on the way in, so files that predate the
// allowlist — or that reached the volume by any other route — are not served either.
const serveAllowedType: RequestHandler = (req, res, next) => {
  if (!dispositionFor(path.basename(req.path))) {
    notFound(req, res);
    return;
  }
  next();
};

export const uploadsRouter = Router();

uploadsRouter.use(serveAllowedType);
uploadsRouter.use(
  express.static(uploadDir, {
    index: false,
    dotfiles: "deny",
    setHeaders: (res, filePath) => {
      // send() sets Content-Type from the extension, which the guard above has
      // already reduced to this table. These three headers are what stop a browser
      // from deciding the response is something more interesting than it is.
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader(
        "Content-Disposition",
        `${dispositionFor(filePath) === "inline" ? "inline" : "attachment"}; filename="${path.basename(filePath)}"`
      );
    },
  })
);