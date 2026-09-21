import { get, post, del, patch, uploadFile } from "./client";
import type {
  ActivityLog,
  Company,
  DashboardData,
  Deliverable,
  Milestone,
  Notification,
  Project,
  ProjectUpdate,
  Task,
  User,
} from "../types";

export interface AuthResponse {
  user: User;
}

export const authApi = {
  me: () => get<AuthResponse>("/api/auth/me"),
  login: (email: string, password: string) =>
    post<AuthResponse>("/api/auth/login", { email, password }),
  register: (data: {
    name: string;
    email: string;
    password: string;
    role: "ADMIN" | "EMPLOYEE" | "CLIENT";
    companyName?: string;
  }) => post<AuthResponse>("/api/auth/register", data),
  logout: () => post<{ ok: boolean }>("/api/auth/logout"),
};

export const companiesApi = {
  list: () => get<Company[]>("/api/companies"),
  create: (name: string) => post<Company>("/api/companies", { name }),
};

export const usersApi = {
  list: () => get<(User & { company?: { id: string; name: string } | null })[]>("/api/users"),
  create: (data: {
    name: string;
    email: string;
    password: string;
    role: "ADMIN" | "EMPLOYEE" | "CLIENT";
    companyId?: string;
  }) => post<{ user: User }>("/api/users", data),
  remove: (id: string) => del<{ ok: boolean }>(`/api/users/${id}`),
};

export const projectsApi = {
  list: () => get<Project[]>("/api/projects"),
  get: (id: string) => get<Project>(`/api/projects/${id}`),
  create: (data: {
    name: string;
    description?: string;
    companyId: string;
    status?: string;
    startDate?: string;
    dueDate?: string;
  }) => post<Project>("/api/projects", data),
  addMember: (projectId: string, userId: string) =>
    post<{ id: string }>(`/api/projects/${projectId}/members`, { userId }),
  activity: (projectId: string) =>
    get<ActivityLog[]>(`/api/projects/${projectId}/activity`),
};

export const tasksApi = {
  list: (projectId: string) => get<Task[]>(`/api/projects/${projectId}/tasks`),
  create: (
    projectId: string,
    data: {
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      assigneeId?: string;
      dueDate?: string;
      clientVisible?: boolean;
    }
  ) => post<Task>(`/api/projects/${projectId}/tasks`, data),
  update: (
    taskId: string,
    data: Partial<{
      title: string;
      description: string;
      status: string;
      priority: string;
      assigneeId: string | null;
      dueDate: string | null;
      clientVisible: boolean;
    }>
  ) => patch<Task>(`/api/tasks/${taskId}`, data),
  remove: (taskId: string) => del<{ ok: boolean }>(`/api/tasks/${taskId}`),
};

export const milestonesApi = {
  create: (projectId: string, name: string, dueDate?: string) =>
    post<Milestone>(`/api/projects/${projectId}/milestones`, { name, dueDate: dueDate ?? null }),
};

export const updatesApi = {
  list: (projectId: string) => get<ProjectUpdate[]>(`/api/projects/${projectId}/updates`),
  create: (
    projectId: string,
    data: {
      title: string;
      body: string;
      progress?: number;
      visibility: "INTERNAL" | "CLIENT";
      fileUrl?: string;
      taskId?: string;
    }
  ) => post<ProjectUpdate>(`/api/projects/${projectId}/updates`, data),
  comment: (updateId: string, body: string) =>
    post<unknown>(`/api/updates/${updateId}/comments`, { body }),
};

export const deliverablesApi = {
  list: (projectId: string) => get<Deliverable[]>(`/api/projects/${projectId}/deliverables`),
  create: (
    projectId: string,
    data: { name: string; description?: string; fileUrl?: string; deliveryLink?: string }
  ) => post<Deliverable>(`/api/projects/${projectId}/deliverables`, data),
  approve: (id: string) => post<Deliverable>(`/api/deliverables/${id}/approve`),
  requestChanges: (id: string, feedback: string) =>
    post<Deliverable>(`/api/deliverables/${id}/request-changes`, { feedback }),
  comment: (id: string, body: string) =>
    post<unknown>(`/api/deliverables/${id}/comments`, { body }),
};

export const notificationsApi = {
  list: () => get<Notification[]>("/api/notifications"),
  markAllRead: () => post<{ count: number }>("/api/notifications/read-all"),
};

export const dashboardApi = {
  get: () => get<DashboardData>("/api/dashboard"),
};

export { uploadFile };