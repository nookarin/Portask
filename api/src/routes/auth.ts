import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError, wrap } from "../lib/errors.js";
import { COOKIE_NAME, cookieOptions, signToken } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import type { User } from "@prisma/client";
import type { RequestHandler } from "express";

const router = Router();

function sanitize(user: User & { company?: { id: string; name: string } | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    company: user.company ?? null,
  };
}

const registerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "EMPLOYEE", "CLIENT"]).default("EMPLOYEE"),
  companyName: z.string().min(1).optional(),
  companyId: z.string().optional(),
});

const register: RequestHandler = wrap(async (req, res) => {
  const input = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ApiError(409, "An account with this email already exists.");

  if (input.role === "CLIENT" && !input.companyId && !input.companyName) {
    throw new ApiError(400, "Client accounts must belong to a company.");
  }

  let companyId = input.companyId;
  if (input.role === "CLIENT" && !companyId) {
    const company = await prisma.company.create({ data: { name: input.companyName! } });
    companyId = company.id;
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      companyId,
    },
    include: { company: true },
  });

  res.cookie(COOKIE_NAME, signToken(user.id, user.role), cookieOptions());
  res.status(201).json({ user: sanitize(user) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const login: RequestHandler = wrap(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { company: true },
  });
  if (!user) throw new ApiError(401, "Invalid email or password.");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new ApiError(401, "Invalid email or password.");

  res.cookie(COOKIE_NAME, signToken(user.id, user.role), cookieOptions());
  res.json({ user: sanitize(user) });
});

const logout: RequestHandler = (_req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.json({ ok: true });
};

const me: RequestHandler = (req, res) => {
  res.json({ user: sanitize(req.user! as User & { company?: { id: string; name: string } | null }) });
};

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

export default router;