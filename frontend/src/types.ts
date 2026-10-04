export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE" | "FREELANCER" | "CLIENT";

/**
 * Role groups mirroring `api/src/lib/roles.ts`, which is the authority. Keeping them in
 * one place here means a route guard, a nav item, and a dashboard variant cannot drift
 * apart by someone checking only one of them.
 */
export const INTERNAL_ROLES: Role[] = ["ADMIN", "MANAGER", "EMPLOYEE", "FREELANCER"];
export const MANAGEMENT_ROLES: Role[] = ["ADMIN", "MANAGER"];

export function isInternalRole(role: Role | undefined): boolean {
  return role !== undefined && INTERNAL_ROLES.includes(role);
}

export function isManagementRole(role: Role | undefined): boolean {
  return role !== undefined && MANAGEMENT_ROLES.includes(role);
}

export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED";
export type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type DeliverableStatus =
  | "DRAFT"
  | "AWAITING_CLIENT_REVIEW"
  | "APPROVED"
  | "CHANGES_REQUESTED";

export interface Company {
  id: string;
  name: string;
  createdAt: string;
  _count?: { users: number; projects: number };
  users?: Pick<User, "id" | "name" | "email" | "role">[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  bio?: string | null;
  availableForWork?: boolean;
  role: Role;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
}

export interface ProjectMember {
  id: string;
  user: Pick<User, "id" | "name" | "email" | "role">;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: Pick<User, "id" | "name" | "role">;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeId?: string | null;
  assignee?: Pick<User, "id" | "name" | "email"> | null;
  projectId: string;
  dueDate?: string | null;
  clientVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  name: string;
  dueDate?: string | null;
  projectId: string;
  createdAt: string;
}

export interface ProjectUpdate {
  id: string;
  title: string;
  body: string;
  progress: number;
  visibility: "INTERNAL" | "CLIENT";
  fileUrl?: string | null;
  projectId: string;
  author: Pick<User, "id" | "name" | "email" | "role">;
  comments: Comment[];
  createdAt: string;
}

export interface Deliverable {
  id: string;
  name: string;
  description?: string | null;
  fileUrl?: string | null;
  deliveryLink?: string | null;
  status: DeliverableStatus;
  feedback?: string | null;
  projectId: string;
  uploader: Pick<User, "id" | "name" | "email" | "role">;
  comments: Comment[];
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  detail?: string | null;
  projectId: string;
  user: Pick<User, "id" | "name" | "role">;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  companyId: string;
  company: Pick<Company, "id" | "name">;
  status: ProjectStatus;
  startDate?: string | null;
  dueDate?: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
  members?: ProjectMember[];
  tasks?: Task[];
  milestones?: Milestone[];
  updates?: ProjectUpdate[];
  deliverables?: Deliverable[];
  activityLogs?: ActivityLog[];
  _count?: { tasks: number; deliverables: number; updates: number };
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export type CalendarEventType = "TASK" | "MILESTONE" | "PROJECT";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string;
  projectId: string;
  projectName: string;
  status?: string;
  priority?: string;
  assigneeName?: string | null;
}

export interface DashboardData {
  counts: {
    activeProjects: number;
    riskProjects: number;
    blockedTasks: number;
    pendingDeliverables: number;
  };
  recentUpdates: (ProjectUpdate & { project: Pick<Project, "id" | "name"> })[];
  recentActivity: (ActivityLog & { project?: Pick<Project, "id" | "name"> })[];
  myTasks: (Task & { project: Pick<Project, "id" | "name"> })[];
  tasksDueSoon: Task[];
  blockedMyTasks: Task[];
  upcomingMilestones: (Milestone & { project: Pick<Project, "id" | "name"> })[];
}

export type DbProvider = "postgresql" | "mysql" | "sqlite" | "mongodb";
export type DbPreset = "sqlite" | "postgresql" | "supabase" | "mysql" | "mongodb" | "custom";

export interface DbSettingsInput {
  preset: DbPreset;
  customProvider?: DbProvider;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  folder?: string;
  connectionString?: string;
}

export interface DbStatus {
  provider: DbProvider;
  label: string;
  source: "default" | "custom";
  configuredAt?: string;
  healthy: boolean;
  connection: string;
  configPath: string;
}

export interface DbTestResult {
  ok: boolean;
  provider: DbProvider;
  label: string;
  connection: string;
  warnings?: string[];
}

export interface DbInspectResult {
  ok: boolean;
  warnings: string[];
}

export type PublicCommentStatus = "PENDING" | "APPROVED" | "SPAM";

export interface ProgressReport {
  id: string;
  title: string;
  intro?: string | null;
  token: string;
  enabled: boolean;
  expiresAt?: string | null;
  projectId: string;
  createdById: string;
  project?: Pick<Project, "id" | "name">;
  _count?: { updates: number; deliverables: number; comments: number };
  createdAt: string;
  updatedAt: string;
}

export interface ReportDetail extends ProgressReport {
  updates: { updateId: string; update: Pick<ProjectUpdate, "id" | "title" | "body" | "progress" | "fileUrl" | "createdAt"> }[];
  deliverables: { deliverableId: string; deliverable: Pick<Deliverable, "id" | "name" | "description" | "fileUrl" | "status" | "createdAt"> }[];
  comments: PublicComment[];
  availableUpdates: (Pick<ProjectUpdate, "id" | "title" | "visibility" | "createdAt">)[];
  availableDeliverables: (Pick<Deliverable, "id" | "name" | "status" | "createdAt">)[];
}

export interface PublicComment {
  id: string;
  authorName: string;
  body: string;
  status?: PublicCommentStatus;
  createdAt: string;
}

export interface PublicReportData {
  title: string;
  intro?: string | null;
  project: {
    name: string;
    status: ProjectStatus;
    startDate?: string | null;
    dueDate?: string | null;
    progress: number;
  };
  updates: Pick<ProjectUpdate, "id" | "title" | "body" | "progress" | "fileUrl" | "createdAt">[];
  deliverables: Pick<Deliverable, "id" | "name" | "description" | "fileUrl" | "status" | "createdAt">[];
  comments: PublicComment[];
  updatedAt: string;
}