import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Route not found." });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid input.", issues: err.flatten() });
    return;
  }

  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type: string }).type === "entity.parse.failed"
  ) {
    res.status(400).json({ error: "Invalid JSON body." });
    return;
  }

  logger.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
}