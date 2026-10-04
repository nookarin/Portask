import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import { env } from "./env.js";
import { notFound, errorHandler } from "./middleware/errors.js";
import { globalLimiter } from "./lib/rateLimit.js";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import companiesRouter from "./routes/companies.js";
import usersRouter from "./routes/users.js";
import talentRouter from "./routes/talent.js";
import projectsRouter from "./routes/projects.js";
import { projectTasksRouter, taskRouter } from "./routes/tasks.js";
import milestonesRouter from "./routes/milestones.js";
import { projectUpdatesRouter, updateCommentsRouter } from "./routes/updates.js";
import {
  projectDeliverablesRouter,
  deliverableRouter,
  deliverableCommentsRouter,
} from "./routes/deliverables.js";
import notificationsRouter from "./routes/notifications.js";
import dashboardRouter from "./routes/dashboard.js";
import uploadRouter, { uploadsRouter } from "./routes/upload.js";
import settingsRouter from "./routes/settings.js";
import calendarRouter from "./routes/calendar.js";
import profileRouter from "./routes/profile.js";
import { reportsRouter, publicReportsRouter } from "./routes/reports.js";

export const app = express();

// Only trust forwarding headers when a proxy is actually declared in front of the
// API, so `req.secure` (Secure cookie flag) and `req.ip` (rate limiting) reflect the
// browser's connection instead of the proxy's plain-HTTP hop.
if (env.TRUST_PROXY > 0) app.set("trust proxy", env.TRUST_PROXY);

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.use("/uploads", uploadsRouter);

app.use("/api/health", healthRouter);
app.use(globalLimiter);
app.use("/api/auth", authRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/users", usersRouter);
app.use("/api/talent", talentRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/projects", projectTasksRouter);
app.use("/api/projects", milestonesRouter);
app.use("/api/projects", projectUpdatesRouter);
app.use("/api/projects", projectDeliverablesRouter);
app.use("/api/tasks", taskRouter);
app.use("/api/updates", updateCommentsRouter);
app.use("/api/deliverables", deliverableRouter);
app.use("/api/deliverables", deliverableCommentsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/upload", uploadRouter);
// Repointing the app at an arbitrary connection string is a development-only tool.
// In production the API must serve DATABASE_URL and nothing else, so the router is
// never mounted and every /api/settings path falls through to `notFound` as a plain
// 404 instead of existing behind an admin check. `switchDatabase`/`resetToDefault`
// refuse the operation as well, so the gate does not depend on this mount point.
if (env.NODE_ENV !== "production") app.use("/api/settings", settingsRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/profile", profileRouter);
app.use("/api/reports", reportsRouter);
app.use("/public/report", publicReportsRouter);

app.use(notFound);
app.use(errorHandler);