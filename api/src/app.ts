import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import path from "node:path";

import { env } from "./env.js";
import { notFound, errorHandler } from "./middleware/errors.js";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import companiesRouter from "./routes/companies.js";
import usersRouter from "./routes/users.js";
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
import uploadRouter from "./routes/upload.js";

export const app = express();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/users", usersRouter);
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

app.use(notFound);
app.use(errorHandler);