# Portask — Product Requirements Document

## 1. Product overview

Portask is a B2B client portal for creative agencies and service businesses. It gives internal teams one place to manage project work and lets clients securely view progress, give feedback, and approve deliverables.

## 2. Problem

Agencies often share updates across chat, email, spreadsheets, and separate file links. Clients do not have a clear view of project status, while employees spend time answering repeated “What is the update?” questions.

Portask creates a shared, secure project workspace with clear ownership and an auditable update history.

## 3. Target users

- **Agency Admin:** manages the agency workspace, employees, clients, and projects.
- **Employee:** updates assigned work, posts progress, uploads deliverables, and flags blockers.
- **Client:** views only their company’s projects, receives updates, leaves feedback, and approves deliverables.

## 4. MVP goals

- Create and manage client companies and projects.
- Assign employees to projects.
- Create tasks with status, priority, deadline, and assignee.
- Let employees post project updates and upload deliverables.
- Let clients securely view their own project updates and files.
- Let clients comment on updates and approve or request changes to deliverables.
- Show dashboards relevant to each user role.
- Record a project activity history.

## 5. Core user flows

### Agency Admin

1. Creates a client company.
2. Invites client users and agency employees.
3. Creates a project and assigns the client company.
4. Adds employees to the project.
5. Creates tasks and assigns work.

### Employee

1. Signs in and views assigned tasks.
2. Updates task status: To Do, In Progress, Blocked, or Done.
3. Posts a project update with progress notes.
4. Uploads a deliverable for client review.
5. Marks an item as blocked when help is needed.

### Client

1. Signs in and sees only projects belonging to their company.
2. Opens a project dashboard and views recent updates, milestones, tasks, and files.
3. Comments on an update or deliverable.
4. Approves a deliverable or requests changes.

## 6. Features and requirements

### Authentication and authorization

- Email/password sign-up and sign-in.
- Roles: `ADMIN`, `EMPLOYEE`, `CLIENT`.
- Route protection for authenticated users.
- Role-based permissions.
- Multi-tenant data isolation: a client must never access another client company’s projects, files, tasks, or comments.

### Project management

Each project includes:

- Project name
- Client company
- Description
- Status: Planning, Active, On Hold, Completed
- Start date and due date
- Internal team members
- Project progress percentage
- Milestones
- Recent activity

### Task management

Each task includes:

- Title and description
- Status: To Do, In Progress, Blocked, Done
- Priority: Low, Medium, High
- Assignee
- Due date
- Related project
- Optional client visibility toggle

### Updates and activity

Employees can create updates containing:

- Update title
- Written progress note
- Current progress percentage
- Related task or milestone
- Visibility: Internal or Client-visible
- Optional attachment

Every important action creates an activity-log entry, including task-status changes, updates, comments, uploads, approvals, and changes requested.

### Deliverables and approvals

- Employees upload a file or add a delivery link.
- A deliverable has status: Draft, Awaiting Client Review, Approved, Changes Requested.
- Clients can approve or request changes.
- Clients can leave a comment explaining requested changes.
- Employees receive a notification when the review status changes.

### Dashboard

**Admin dashboard**

- Active projects
- Projects at risk or overdue
- Blocked tasks
- Deliverables awaiting client approval
- Recent agency activity

**Employee dashboard**

- My assigned tasks
- Tasks due soon
- Blocked tasks
- Recent project updates

**Client dashboard**

- Active projects
- Latest client-visible updates
- Deliverables awaiting review
- Upcoming milestones

## 7. Non-functional requirements

- Responsive desktop and mobile layout.
- Accessible forms, labels, and color contrast.
- Clear loading, empty, error, and success states.
- Server-side authorization for every protected request.
- Structured application logs.
- Health-check endpoint at `/api/health`.
- Environment variables for secrets and configuration.
- Production deployment with HTTPS.

## 8. Recommended technical stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT stored in secure HTTP-only cookies
- **File storage:** Cloudinary, AWS S3, or Supabase Storage
- **Testing:** Vitest, React Testing Library, and Supertest
- **Deployment:** Dockerized services on a single VPS (Render/Railway alternatives), or managed platform
- **DevOps:** Docker, Docker Compose, GitHub Actions, environment variables, health checks, and structured logging

### Docker architecture

The app is containerized with a `docker-compose.yml` at the repository root:

| Service     | Image base         | Port      | Purpose                                   |
| ----------- | ------------------ | --------- | ----------------------------------------- |
| `frontend`  | `node:22-alpine`   | `5173`    | React/Vite dev server; static build in prod |
| `api`       | `node:22-alpine`   | `5000`    | Express + TypeScript REST API             |
| `db`        | `postgres:16-alpine` | `5432`  | PostgreSQL database with named volume     |

- Multi-stage `Dockerfile` for the API (compile TypeScript, install only production dependencies in the final image) and for the frontend (build static assets, serve via nginx or `serve`).
- A `db` volume persists database data across container restarts.
- Services communicate over an internal Docker network; only `frontend` and `api` expose ports to the host.
- The API container runs migrations on startup and waits for `db` to be healthy before starting.
- Each service defines a `healthcheck` used by Compose and by the CI pipeline.
- `docker-compose.yml`, `.env.example`, and a `Makefile` or npm scripts document one-command local startup (`docker compose up -d`).

### CI/CD pipeline (GitHub Actions)

A `.github/workflows/ci.yml` workflow guards each pull request, and a deploy workflow releases the `main` branch:

**CI — on every push and pull request**

1. Checkout and set up Node.js (22) and PostgreSQL (16) services.
2. Install dependencies, typecheck, lint, and run unit tests (Vitest) and API tests (Supertest).
3. Build the frontend and API to catch production build errors.
4. Tag and push `api` and `frontend` images to GitHub Container Registry (GHCR) on `main`.

**CD — on merge to `main`**

1. Build Docker images with the commit SHA as the tag.
2. Push images to GHCR.
3. Deploy to the target environment (VPS via SSH `docker compose pull && up -d`, or a managed platform).
4. Run a smoke check against `/api/health` and frontend root after deployment.

Static analysis (lint, typecheck) and tests must pass before any image is pushed, and composability is verified by running `docker compose build` and `docker compose config` in CI.

### Environments

| Environment | Database backup | Deploy trigger       | Purpose                |
| ----------- | --------------- | -------------------- | ---------------------- |
| `development` | none, seeded locally | none                 | Local `docker compose up` |
| `staging`   | nightly         | push to `main` (optional staging branch) | Pre-release verification |
| `production`| nightly + hot load | tagged release       | Client-facing app       |

Secrets are stored as GitHub Actions secrets and injected as container environment variables; the `.env` file is never committed.

## 9. Main database entities

- `User`
- `Company`
- `Project`
- `ProjectMember`
- `Task`
- `Milestone`
- `ProjectUpdate`
- `Deliverable`
- `Comment`
- `ActivityLog`
- `Notification`

Important relationships:

- A Company has many client Users and Projects.
- A Project belongs to one Company and has many Tasks, Updates, Deliverables, and Members.
- An Employee can belong to many Projects.
- A Client can view only the Projects belonging to their Company.
- A Deliverable belongs to one Project and can have comments and one approval status.

## 10. Main pages

- Landing page
- Sign in / Register
- Admin dashboard
- Employee dashboard
- Client dashboard
- Projects list
- Project detail page
- Task board
- Deliverables page
- Notifications page
- Team and client management page
- Profile/settings page

## 11. MVP acceptance criteria

The MVP is complete when:

1. An admin can create a company, users, projects, and tasks.
2. An employee can update assigned tasks and publish client-visible project updates.
3. A client can sign in and see only their own company’s projects.
4. A client can comment on and approve or request changes to deliverables.
5. The app records meaningful activity in a project timeline.
6. The frontend, API, and database are deployed.
7. The repository includes setup instructions, environment-variable documentation, and an architecture diagram.
8. A CI workflow runs tests and builds the app on each pull request.

## 12. Out of scope for MVP

- Real-time chat
- Billing and invoicing
- Calendar synchronization
- Advanced project analytics
- Native mobile applications
- Multi-language support
- Full Kubernetes deployment

## 13. Suggested build order

1. Set up the repository, database, authentication, and role-based access.
2. Build company, user, project, and task CRUD.
3. Build employee updates and client project views.
4. Add deliverables, comments, and approval flow.
5. Add dashboards and activity logs.
6. Dockerize the app and create CI/CD.
7. Deploy, add monitoring, and write documentation.