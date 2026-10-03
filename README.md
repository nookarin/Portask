# Portask

B2B client portal for creative agencies and service businesses. Manage projects internally and let clients securely view progress, give feedback, and approve deliverables.

Built with React, Node.js, Express, PostgreSQL (Prisma), Docker, and GitHub Actions CI/CD.

## Architecture

```
┌────────────────────────────────────────────────┐
│  frontend  (React + Vite + Tailwind)           │
│  dev: Vite dev server  /  prod: nginx          │
└───────────────┬────────────────────────────────┘
                │  /api  (HTTP)
┌───────────────▼────────────────────────────────┐
│  api  (Node.js + Express + TypeScript + Prisma) │
└───────────────┬────────────────────────────────┘
                │  PostgreSQL wire protocol
┌───────────────▼────────────────────────────────┐
│  db  (PostgreSQL 16, named volume)              │
└────────────────────────────────────────────────┘
```

- `api/` — Express REST API (TypeScript)
- `frontend/` — React SPA (Vite + Tailwind)
- `.github/workflows/ci.yml` — CI/CD pipeline
- `docker-compose.yml` — local development environment

## Quick start

Prerequisites: Docker + Docker Compose.

```bash
docker compose up -d --build
```

Containers:

- Frontend: http://localhost:5173
- API: http://localhost:5000/api/health
- Database: localhost:5432

The API seeds demo data on first boot (run explicitly with `npm run seed` inside the `api` service). The first admin is provisioned from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on the first boot of the image — see [Accounts and roles](#accounts-and-roles).

### Demo accounts

The dev stack ships with `ADMIN_EMAIL` / `ADMIN_PASSWORD` defaults in `docker-compose.yml`; override them in `.env`.

| Role      | Email                   | Password     |
| --------- | ----------------------- | ------------ |
| Admin     | admin@portask.dev       | admin123     |
| Employee  | employee@portask.dev    | employee123  |
| Client    | client@portask.dev      | client123    |

## Accounts and roles

- **Public signup is client-only.** `POST /api/auth/register` ignores the concept of a role entirely: a `role` field in the body is rejected with `400`, and the account is always created as `CLIENT` with a company. There is no self-service path to agency staff.
- **Staff accounts come from an admin.** `ADMIN` and `EMPLOYEE` users are created by an existing admin via `POST /api/users` (Team page), which is itself guarded by `requireRole("ADMIN")`.
- **The first admin comes from the image.** On startup the API runs `bootstrapAdmin()` (`api/src/lib/bootstrapAdmin.ts`): if no `ADMIN` row exists yet, it creates one from `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`. If no admin exists and those variables are unset, the API exits with an error instead of shipping a default account. The step is idempotent — it never re-provisions or resets credentials once an admin exists.

## Local development without Docker

```bash
# API
cd api
npm install
# point DATABASE_URL at a local/remote Postgres
npx prisma db push
npm run dev        # http://localhost:5000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api to :5000)
```

The API bootstraps the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on an empty database, so set them in `api/.env` before `npm run dev`.

## HTTPS and the session cookie

The session lives in the `portask_token` cookie (`httpOnly`, `sameSite=lax`, 7 days). Browsers **discard `Secure` cookies received over plain HTTP**, so a cookie that is unconditionally `Secure` in production makes login return `200` while every later request arrives unauthenticated — the app looks broken with no error to explain it. The flag is therefore resolved per request:

| `COOKIE_SECURE` | Resulting `Secure` flag                                                             |
| ---------------- | ------------------------------------------------------------------------------------ |
| unset (default)  | `Secure` only when the request arrived over HTTPS                                     |
| `true`           | always `Secure`                                                                       |
| `false`          | never `Secure` (the cookie travels in clear text — plain-HTTP deployments only)      |

`req.secure` only sees HTTPS if the API is told to trust the proxy in front of it, so `TRUST_PROXY` must equal the number of proxy hops: `1` for the bundled nginx, `2` when a TLS-terminating load balancer sits in front of it. The bundled nginx forwards the *browser-facing* protocol (it preserves an incoming `X-Forwarded-Proto` instead of overwriting it with its own `http`), which is what makes TLS termination work without touching the API.

Pick one for a deployment:

- **TLS terminated upstream (recommended)** — let a load balancer or reverse proxy serve HTTPS, forward to the bundled nginx over HTTP, keep `COOKIE_SECURE` unset and set `TRUST_PROXY` to your hop count. Also point `FRONTEND_URL` at the `https://` origin, since CORS uses it.
- **Plain HTTP (the bundled prod compose, port 80 only)** — set `COOKIE_SECURE=false` to make login work, accepting that the session token is unencrypted on the wire. Fine for a LAN or behind a VPN, not for the public internet.
- **TLS in the frontend container** — mount certificates into nginx and add an `ssl` server block; keep `TRUST_PROXY=1` and `COOKIE_SECURE` unset.

Starting in `production` with `COOKIE_SECURE` unset logs a warning at boot, so an unconfigured deployment never fails silently again.

## Environment variables

See `.env.example`. Required values:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — secret used to sign auth cookies
- `PORT` — API port (default 5000)
- `FRONTEND_URL` — allowed CORS origin
- `NODE_ENV` — `development | production`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` — credentials for the first admin, created on the first boot of the image (no default; required on a fresh production database)
- `TRUST_PROXY` — number of reverse-proxy hops in front of the API (default `0`; `1` for the bundled nginx). Required for `Secure` cookies and real client IPs behind TLS termination.
- `COOKIE_SECURE` — force the `Secure` cookie flag on/off; leave unset to derive it from the request protocol. See [HTTPS and the session cookie](#https-and-the-session-cookie).

Secrets are injected via Docker Compose or GitHub Actions secrets; the `.env` file is never committed.

## Scripts

| Command                | Runs in  | Purpose                          |
| ---------------------- | -------- | -------------------------------- |
| `make dev`             | root     | `docker compose up -d --build`   |
| `make prod`            | root     | `docker compose -f docker-compose.prod.yml up -d --build` |
| `npm run dev`          | api      | Dev server (tsx watch)           |
| `npm run build`        | api      | Compile TypeScript               |
| `npm run test`         | api      | Vitest + Supertest integration    |
| `npm run seed`         | api      | Seed demo data                   |
| `npm run dev`          | frontend | Vite dev server                  |
| `npm run build`        | frontend | Production build                 |
| `npm run test`         | frontend | Vitest + React Testing Library   |

## API overview

| Endpoint                                  | Methods            | Description                              |
| ----------------------------------------- | ------------------ | ---------------------------------------- |
| `/api/health`                             | GET                | Health check incl. DB connectivity       |
| `/api/auth/register`                      | POST               | Public client signup (client role only)    |
| `/api/auth/login`, `/api/auth/logout`     | POST               | Cookie session                           |
| `/api/auth/me`                            | GET                | Current user + role                      |
| `/api/companies`                          | GET, POST          | Manage client companies (admin)          |
| `/api/users`                              | GET, POST          | Manage users (admin)                     |
| `/api/projects`                           | GET, POST          | List/create projects                     |
| `/api/projects/:id`                       | GET, PUT, DELETE   | Project detail/update                    |
| `/api/projects/:id/members`               | POST, DELETE       | Manage project members                   |
| `/api/projects/:id/tasks`                 | GET, POST          | Tasks for a project                      |
| `/api/tasks/:id`                          | PATCH, DELETE      | Update status/assignee → activity log    |
| `/api/projects/:id/milestones`            | GET, POST          | Milestones                               |
| `/api/projects/:id/updates`               | GET, POST          | Project updates (client-visible filter)  |
| `/api/projects/:id/deliverables`          | GET, POST          | Deliverables                             |
| `/api/deliverables/:id/approve`           | POST               | Client approves deliverable              |
| `/api/deliverables/:id/request-changes`   | POST               | Client requests changes (+ notification) |
| `/api/updates/:id/comments`               | POST               | Comment on an update                     |
| `/api/deliverables/:id/comments`          | POST               | Comment on a deliverable                 |
| `/api/projects/:id/activity`              | GET                | Activity timeline                        |
| `/api/notifications`                      | GET, POST          | Notifications / mark-read                |
| `/api/calendar`                           | GET                | Role-scoped task/milestone/project dates |
| `/api/profile`                            | GET, PATCH         | View/update profile, change password      |
| `/api/dashboard`                          | GET                | Role-aware dashboard metrics             |
| `/api/reports`                            | GET, POST          | Create/manage public progress reports     |
| `/api/reports/:id`                        | GET, PATCH         | Report detail, rename, revoke, set expiry |
| `/api/reports/:id/curation`               | PUT                | Choose which updates/deliverables publish  |
| `/api/reports/:id/comments`               | GET                | All public comments incl. pending/spam    |
| `/api/reports/:id/comments/:commentId`    | PATCH, DELETE      | Approve / mark spam / delete a comment    |
| `/public/report/:token`                   | GET                | Public report page — no authentication    |
| `/public/report/:token/comments`          | POST               | Public comment (rate limited)             |

Access rules: `ADMIN`/`EMPLOYEE` are agency staff with full access; `CLIENT` is restricted to projects of their own company. Every request is authorized server-side.

## Public progress reports

An employee can curate a progress report for a project and share it with anyone who has the link — no account required. Available under **Public reports** in the sidebar (`/reports`).

The public URL is `/r/<token>`, where the token is 24 bytes of `crypto.randomBytes` and is the only thing granting access.

- **Curation, not mirroring.** The employee ticks specific client-visible updates and deliverables. Internal updates (`visibility=INTERNAL`) are rejected by the curation endpoint and filtered again when rendering, so they cannot leak even through a stale join row.
- **Revocation.** `enabled: false` immediately makes the link return 404. Optional `expiresAt` cuts it off automatically.
- **Comments are moderated.** Public comments land as `PENDING` and are invisible until an employee approves them from the report editor. Visitors are rate limited to 5 comments per report per hour, plus a 5-per-10-minutes IP limit; the IP is stored only as a truncated SHA-256 hash.
- **Public payloads are trimmed.** The response omits internal ids, commenter IP hashes, moderation status, and author emails, and sends `X-Robots-Tag: noindex` so the link is not crawled.

Revoked, expired, unknown and malformed tokens all return an identical 404 so the endpoint never confirms that a token exists.

Requires `express-rate-limit`, already added as a dependency. Nginx and the Vite dev server both proxy `/public/` to the API.

## CI/CD

`.github/workflows/ci.yml`:

- **CI (PRs):** install, lint/typecheck, unit + API tests against a Postgres service, production builds.
- **CD (`main`):** build & push `api`/`frontend` images to GHCR (tagged with `git.sha`), deploy to the target host, smoke-check `/api/health`.

Deploy requires the repository secrets `JWT_SECRET`, `POSTGRES_PASSWORD`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Testing

```bash
cd api && npm test        # requires DATABASE_URL (postgres running)
cd frontend && npm test
```
