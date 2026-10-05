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
| Manager   | manager@portask.dev     | manager123   |
| Employee  | employee@portask.dev    | employee123  |
| Freelancer| freelancer@portask.dev  | freelancer123|
| Client    | client@portask.dev      | client123    |

## Accounts and roles

- **Public signup is client-only.** `POST /api/auth/register` ignores the concept of a role entirely: a `role` field in the body is rejected with `400`, and the account is always created as `CLIENT` with a company. There is no self-service path to agency staff.
- **Staff accounts come from an admin or a manager.** `ADMIN`, `MANAGER`, `EMPLOYEE` and `FREELANCER` users are created via `POST /api/users` (Team page), guarded by `requireManagement` (admin or manager).
- **The first admin comes from the image.** On startup the API runs `bootstrapAdmin()` (`api/src/lib/bootstrapAdmin.ts`): if no `ADMIN` row exists yet, it creates one from `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`. If no admin exists and those variables are unset, the API exits with an error instead of shipping a default account. The step is idempotent — it never re-provisions or resets credentials once an admin exists.

### The five roles

| | `ADMIN` | `MANAGER` | `EMPLOYEE` | `FREELANCER` | `CLIENT` |
| --- | --- | --- | --- | --- | --- |
| Sees every project | yes | yes | yes | yes | own company |
| Creates projects, tasks, deliverables, internal updates | yes | yes | yes | yes | no |
| Curation and comment moderation on public reports | yes | yes | yes | yes | no |
| Manages client companies and the team (`/api/users`) | yes | yes | no | no | no |
| Reads the talent list (`/api/talent`) | yes | yes | no | no | no |
| Deletes a project | yes | yes | no | no | no |
| Creates another `ADMIN` | yes | no | no | no | no |
| `/api/settings` (database switcher, development only) | yes | no | no | no | no |

Two groups drive every guard, declared once in `api/src/lib/roles.ts` and mirrored in `frontend/src/types.ts`:

- `INTERNAL_ROLES` = admin, manager, employee, freelancer — agency staff, full access to every project.
- `MANAGEMENT_ROLES` = admin, manager — the client/team/project-deletion powers on top of that.

Role checks are never written inline, so adding a role is a one-line change in each of those two files rather than an edit to every route guard.

**Managers cannot mint an admin.** `POST /api/users` returns `403` if a manager asks for `role: "ADMIN"`. Without that, "manage the team" would be a privilege-escalation path to the one role that can reach `/api/settings` and the admin bootstrap.

### Freelancer availability

Freelancers advertise themselves internally; there is no public profile page or marketplace.

- A freelancer sets **Available for work** and a short bio (max 500 characters) on **Profile** (`PATCH /api/profile`). Only `FREELANCER` accounts may set availability — the API returns `400` for anyone else, and any role may write a bio.
- Admins and managers read `GET /api/talent`, which returns only freelancers whose `availableForWork` is true, and only the fields needed to staff somebody (`id`, `name`, `email`, `avatarUrl`, `bio`). It is deliberately not a directory of every account in the workspace.
- Assignment reuses `POST /api/projects/:id/members`, the same endpoint used from the project page, so there is a single way to put somebody on a project.


## Local development without Docker

```bash
# API
cd api
npm install
# point DATABASE_URL at a local/remote Postgres
npm run prisma:deploy   # applies prisma/migrations — see "Database migrations"
npm run dev        # http://localhost:5000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api to :5000)
```

The API bootstraps the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on an empty database, so set them in `api/.env` before `npm run dev`.

## Database migrations

`api/prisma/migrations/` is the source of truth for the schema. Deploy applies it with `prisma migrate deploy`, which only ever runs the SQL files committed here — it never inspects the live schema and never drops a column to make it match.

### Changing the schema

```bash
cd api
# edit prisma/schema.prisma
npm run prisma:migrate      # writes a timestamped folder under prisma/migrations
# review the generated SQL, then commit schema.prisma and prisma/migrations together
```

CI applies every migration to a scratch database and diffs the result against `schema.prisma`, so a migration that doesn't apply — or a schema edit that was never turned into one — fails the build before it can reach production.

Two rules keep the history replayable:

- **Never edit a migration that has already been merged.** Add a new one. Production has run the old file, so an in-place edit makes the same migration mean different things on different databases.
- **Destructive steps are yours to write.** Renaming a column is really drop + add; a `DROP COLUMN` or a narrowing type change silently discards data. `migrate deploy` applies it without asking.

Use `npm run prisma:status` on a deployment to see which migrations have been applied.

### Adding a value to the `Role` enum

PostgreSQL enums are append-only, and Prisma replays the declaration order from the schema. Declaring a new value in the middle of `enum Role` therefore plans a full type rewrite — rename the type, recreate it, copy every row — instead of a cheap `ALTER TYPE ... ADD VALUE`. New roles are **appended** at the bottom of the enum, in a migration of their own, and the ordering carries a comment in `schema.prisma` so it is not "tidied up" later.

The generated SQL for a role is one line, and it can be produced without a database:

```bash
npx prisma migrate diff \
  --from-schema-datamodel <previous-schema.prisma> \
  --to-schema-datamodel prisma/schema.prisma --script
```

Adding more than one value in a single migration requires PostgreSQL 12 or newer; on 11 and earlier each value needs its own migration. The project targets 16.

### Throwaway vs. real databases

`prisma db push` is still used where the schema is disposable and history is worthless — `npm test` and `docker compose up` — because it is faster than replaying migrations against a scratch database.

A database created by `db push` has no migration history, so the first `migrate deploy` against it tries to `CREATE TABLE` over tables that already exist. Mark the baseline as applied once, then deploys are ordinary:

```bash
docker compose -f docker-compose.prod.yml run --rm api \
  npx prisma migrate resolve --applied 20261004090000_init
```

`resolve --applied` only records the migration in `_prisma_migrations`; it does not touch your tables. Run it once, before the first `migrate deploy`, against any database that predates the migrations directory. Skip it if production has never been deployed — a fresh database simply replays the migrations from empty.

### The runtime database switcher

`/api/settings` (admin nav → **Database**) repoints the running app at another connection string and pushes the schema onto it with `prisma db push`. That is a development tool, and it is compiled out of production:

- The router is only mounted when `NODE_ENV != production`, so in production every `/api/settings` path is an ordinary `404` rather than an endpoint behind an admin check.
- `switchDatabase` / `resetToDefault` refuse to run unless `NODE_ENV=development`, so no future caller can route around the mount point — and a test suite can never repoint the database it is asserting against.
- Outside development the app ignores `data/db-config.json` and always serves `DATABASE_URL`, so a config left in the persisted volume cannot repoint a deployed instance.
- The frontend hides the nav item and drops the route in production builds.

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
- `NODE_ENV` — `development | production`. Anything other than `development` also disables the database switcher at `/api/settings`; see [The runtime database switcher](#the-runtime-database-switcher).
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` — credentials for the first admin, created on the first boot of the image (no default; required on a fresh production database)
- `TRUST_PROXY` — number of reverse-proxy hops in front of the API (default `0`; `1` for the bundled nginx). Required for `Secure` cookies and real client IPs behind TLS termination.
- `COOKIE_SECURE` — force the `Secure` cookie flag on/off; leave unset to derive it from the request protocol. See [HTTPS and the session cookie](#https-and-the-session-cookie).

Secrets are injected via Docker Compose or GitHub Actions secrets; the `.env` file is never committed.

## Scripts

| Command                | Runs in  | Purpose                          |
| ---------------------- | -------- | -------------------------------- |
| `make dev`             | root     | `docker compose up -d --build`   |
| `make prod`            | root     | Build images, apply pending migrations, then `docker compose -f docker-compose.prod.yml up -d` |
| `npm run dev`          | api      | Dev server (tsx watch)           |
| `npm run build`        | api      | Compile TypeScript               |
| `npm run test`         | api      | Vitest + Supertest integration    |
| `npm run prisma:migrate` | api    | Create a migration from schema changes |
| `npm run prisma:deploy` | api    | Apply migrations (what deploy runs) |
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
| `/api/companies`                          | GET, POST          | Manage client companies (admin/manager)  |
| `/api/users`                              | GET, POST          | Manage users (admin/manager)             |
| `/api/talent`                             | GET                | Available freelancers (admin/manager)    |
| `/api/projects`                           | GET, POST          | List/create projects                     |
| `/api/projects/:id`                       | GET, PUT, DELETE   | Project detail/update; DELETE is admin/manager |
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
| `/api/profile`                            | GET, PATCH         | View/update profile, bio, availability, password |
| `/api/dashboard`                          | GET                | Role-aware dashboard metrics             |
| `/api/upload`                            | POST               | Attachment upload — images and PDF, 10 MB |
| `/api/reports`                            | GET, POST          | Create/manage public progress reports     |
| `/api/reports/:id`                        | GET, PATCH         | Report detail, rename, revoke, set expiry |
| `/api/reports/:id/curation`               | PUT                | Choose which updates/deliverables publish  |
| `/api/reports/:id/comments`               | GET                | All public comments incl. pending/spam    |
| `/api/reports/:id/comments/:commentId`    | PATCH, DELETE      | Approve / mark spam / delete a comment    |
| `/public/report/:token`                   | GET                | Public report page — no authentication    |
| `/public/report/:token/comments`          | POST               | Public comment (rate limited)             |

Access rules: `ADMIN`, `MANAGER`, `EMPLOYEE` and `FREELANCER` are agency staff with full access to every project; `MANAGER` additionally manages clients, the team, and project deletion; `CLIENT` is restricted to projects of their own company. Every request is authorized server-side, and the full matrix is in [The five roles](#the-five-roles).

## Rate limiting

Every throttle is built from one factory, `createLimiter` in `api/src/lib/rateLimit.ts`, so they all behave identically: RFC `RateLimit` standard headers, `Retry-After` on a block, no legacy `X-RateLimit-*`, and a `429` body shaped like every other API error (`{ "error": "..." }`) so the SPA shows the message as-is.

| Scope                                | Window  | Limit | Keyed by                                 |
| ------------------------------------ | ------- | ----- | ---------------------------------------- |
| `POST /api/auth/login`               | 15 min  | 20    | client IP — stops password spraying      |
| `POST /api/auth/login`               | 15 min  | 5     | account email, **failures only**         |
| `POST /api/auth/register`            | 1 hour  | 10    | client IP — public, bcrypt-backed signup |
| whole API (uploads exempt)           | 15 min  | 1000  | client IP — abuse backstop               |
| `GET /public/report/:token`          | 1 min   | 60    | client IP                                |
| `POST /public/report/:token/comments`| 10 min  | 5     | client IP                                |

Login carries two limits on purpose. The per-IP ceiling bounds spraying across many accounts; the per-account ceiling bounds guessing one account from many IPs. The per-account counter uses `skipSuccessfulRequests`, so only `401`s consume budget — someone who fat-fingers their password a few times is never locked out by their own typos. The accepted trade-off is that an attacker who *knows* a victim's address can lock that account for the window; raise the limit or shorten the window if that matters more than brute-force resistance.

Counters live in the default in-memory store, which has two consequences worth knowing:

- They are **per process**. Running multiple API replicas multiplies every limit by the replica count. Add a shared store (e.g. `rate-limit-redis`) or a limiter at your proxy before scaling out.
- They are keyed on `req.ip`, so `TRUST_PROXY` must match the number of proxies in front of the API. Left at `0` behind nginx, every visitor shares the proxy's address and one client can exhaust everyone else's budget.

## Public progress reports

An employee can curate a progress report for a project and share it with anyone who has the link — no account required. Available under **Public reports** in the sidebar (`/reports`).

The public URL is `/r/<token>`, where the token is 24 bytes of `crypto.randomBytes` and is the only thing granting access.

- **Curation, not mirroring.** The employee ticks specific client-visible updates and deliverables. Internal updates (`visibility=INTERNAL`) are rejected by the curation endpoint and filtered again when rendering, so they cannot leak even through a stale join row.
- **Revocation.** `enabled: false` immediately makes the link return 404. Optional `expiresAt` cuts it off automatically.
- **Comments are moderated.** Public comments land as `PENDING` and are invisible until an employee approves them from the report editor. Visitors are rate limited to 5 comments per report per hour, plus a 5-per-10-minutes IP limit; the IP is stored only as a truncated SHA-256 hash.
- **Public payloads are trimmed.** The response omits internal ids, commenter IP hashes, moderation status, and author emails, and sends `X-Robots-Tag: noindex` so the link is not crawled.

Revoked, expired, unknown and malformed tokens all return an identical 404 so the endpoint never confirms that a token exists.

Requires `express-rate-limit`, already added as a dependency. Nginx and the Vite dev server both proxy `/public/` to the API.

## File uploads

`POST /api/upload` (any signed-in user, 10 MB max) writes to `uploads/` and returns a same-origin `/uploads/…` URL, used for update attachments, deliverables and avatars.

**What is checked is the extension, not the Content-Type the client declares.** Accepted: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.pdf`; anything else is a `400` and never reaches the disk. The declared type is ignored on purpose — the uploader picks it, so it proves nothing, and a `.html` payload renamed to `.png` comes back as `image/png` with `nosniff` instead of being parsed as a document.

`/uploads` is served without a session, because a public progress report shows attachments to anyone holding the link. That makes an uploaded file a hazard for whoever opens it and not only for the uploader, so every response carries:

| Header | Why |
| ------ | --- |
| `X-Content-Type-Options: nosniff`   | the browser must use the type we send rather than infer one |
| `Content-Security-Policy: default-src 'none'; sandbox` | no script, no plugins, no same-origin document context, even if the type were wrong |
| `Content-Disposition: inline` for images, `attachment` for PDF | a PDF opens in the browser's viewer instead of in a tab on our origin |

The allowlist is applied on the way out as well as on the way in, so a path outside it is a `404` even when the file is already on disk — tightening the rule also covers files uploaded before it existed. Anything already stored outside the allowlist (`.svg`, `.docx`, …) becomes unreachable and can be removed from the `uploads` volume.

Two gaps left open on purpose:

- **No byte sniffing.** The stored name decides the served type, which is what makes a mislabelled file inert. Rejecting files whose bytes disagree with their extension needs signature detection (e.g. `file-type`) and would only stop them being *stored* — they are already inert when served.
- **No quota.** Uploads are exempt from the global rate limit, and any authenticated user — including a client account — can push 10 MB per request, so disk exhaustion is still possible. A retention policy or per-user quota needs a product decision.

## CI/CD

`.github/workflows/ci.yml`:

- **CI (PRs):** install, lint/typecheck, verify the Prisma migrations apply and still match `schema.prisma`, unit + API tests against a Postgres service, production builds.
- **CD (`main`):** build & push `api`/`frontend` images to GHCR (tagged with `git.sha`), apply pending migrations, deploy to the target host, smoke-check `/api/health`.

Deploy requires the repository secrets `JWT_SECRET`, `POSTGRES_PASSWORD`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Testing

```bash
cd api && npm test        # requires DATABASE_URL (postgres running)
cd frontend && npm test
```
