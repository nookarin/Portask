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

The API seeds demo data on first boot (see `seed.sh` internally; run explicitly with `npm run seed` inside the `api` service).

### Demo accounts

| Role      | Email                   | Password     |
| --------- | ----------------------- | ------------ |
| Admin     | admin@portask.dev       | admin123     |
| Employee  | employee@portask.dev    | employee123  |
| Client    | client@portask.dev      | client123    |

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

## Environment variables

See `.env.example`. Required values:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — secret used to sign auth cookies
- `PORT` — API port (default 5000)
- `FRONTEND_URL` — allowed CORS origin
- `NODE_ENV` — `development | production`

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
| `/api/auth/register`                      | POST               | Create account (client/ad/employee)      |
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

Access rules: `ADMIN`/`EMPLOYEE` are agency staff with full access; `CLIENT` is restricted to projects of their own company. Every request is authorized server-side.

## CI/CD

`.github/workflows/ci.yml`:

- **CI (PRs):** install, lint/typecheck, unit + API tests against a Postgres service, production builds.
- **CD (`main`):** build & push `api`/`frontend` images to GHCR (tagged with `git.sha`), deploy to the target host, smoke-check `/api/health`.

## Testing

```bash
cd api && npm test        # requires DATABASE_URL (postgres running)
cd frontend && npm test
```
