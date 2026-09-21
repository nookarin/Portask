export type Role = "ADMIN" | "EMPLOYEE" | "CLIENT";
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