import { get, post, put, del, patch, uploadFile } from "./client";
import type {
  ActivityLog,
  CalendarEvent,
  Company,
  DashboardData,
  DbSettingsInput,
  DbStatus,
  DbTestResult,
  DbInspectResult,
  Deliverable,
  Milestone,
  Notification,
  ProgressReport,
  Project,
  ProjectUpdate,
  PublicComment,
  PublicCommentStatus,
  PublicReportData,
  ReportDetail,
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
  register: (data: { name: string; email: string; password: string; companyName: string }) =>
    post<AuthResponse>("/api/auth/register", data),
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

export const calendarApi = {
  get: (range?: { start?: string; end?: string }) => {
    const params = new URLSearchParams();
    if (range?.start) params.set("start", range.start);
    if (range?.end) params.set("end", range.end);
    const qs = params.toString();
    return get<CalendarEvent[]>(`/api/calendar${qs ? `?${qs}` : ""}`);
  },
};

export const settingsApi = {
  db: () => get<DbStatus>("/api/settings"),
  inspect: (input: DbSettingsInput) => post<DbInspectResult>("/api/settings/inspect", input),
  test: (input: DbSettingsInput) => post<DbTestResult>("/api/settings/test", input),
  apply: (input: DbSettingsInput, force = false) =>
    post<DbStatus>("/api/settings", { ...input, force }),
  reset: () => post<DbStatus>("/api/settings/reset"),
};

export const profileApi = {
  get: () => get<{ user: User }>("/api/profile"),
  update: (data: {
    name?: string;
    avatarUrl?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) => patch<{ user: User }>("/api/profile", data),
};

export const reportsApi = {
  list: () => get<ProgressReport[]>("/api/reports"),
  get: (id: string) => get<ReportDetail>(`/api/reports/${id}`),
  create: (data: { projectId: string; title: string; intro?: string; expiresAt?: string | null }) =>
    post<ProgressReport>("/api/reports", data),
  update: (
    id: string,
    data: Partial<{ title: string; intro: string | null; enabled: boolean; expiresAt: string | null }>
  ) => patch<ProgressReport>(`/api/reports/${id}`, data),
  saveCuration: (id: string, data: { updateIds?: string[]; deliverableIds?: string[] }) =>
    put<ProgressReport>(`/api/reports/${id}/curation`, data),
  comments: (id: string) => get<PublicComment[]>(`/api/reports/${id}/comments`),
  moderate: (id: string, commentId: string, status: PublicCommentStatus) =>
    patch<PublicComment>(`/api/reports/${id}/comments/${commentId}`, { status }),
  deleteComment: (id: string, commentId: string) =>
    del<{ ok: boolean }>(`/api/reports/${id}/comments/${commentId}`),
};

export const publicReportsApi = {
  view: (token: string) => get<PublicReportData>(`/public/report/${token}`),
  comment: (token: string, data: { authorName: string; body: string }) =>
    post<PublicComment>(`/public/report/${token}/comments`, data),
};

export { uploadFile };