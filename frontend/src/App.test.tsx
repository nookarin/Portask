import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { authApi } from "../src/api";
import type { User } from "../src/types";

const admin: User = {
  id: "u1",
  email: "admin@portask.dev",
  name: "Ari Admin",
  role: "ADMIN",
};

vi.spyOn(authApi, "me").mockResolvedValue({ user: admin });
vi.spyOn(authApi, "logout").mockResolvedValue({ ok: true });

const json = (data: unknown) => async () => data;
const okResponse = (data: unknown) =>
  ({ ok: true, status: 200, json: json(data) }) as Response;

beforeEach(() => {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/dashboard")) {
      return Promise.resolve(
        okResponse({
          counts: { activeProjects: 1, riskProjects: 0, blockedTasks: 0, pendingDeliverables: 0 },
          recentUpdates: [],
          recentActivity: [],
          myTasks: [],
          tasksDueSoon: [],
          blockedMyTasks: [],
          upcomingMilestones: [],
        })
      );
    }
    if (url.includes("/api/users")) return Promise.resolve(okResponse([]));
    if (url.includes("/api/companies")) return Promise.resolve(okResponse([]));
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
});

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  render(<App />);
}

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("App routing", () => {
  it("shows the landing page to unauthenticated users at /", async () => {
    vi.spyOn(authApi, "me").mockRejectedValueOnce(new Error("401"));
    renderAt("/");
    expect(await screen.findByText(/Agency project tracking/i)).toBeInTheDocument();
  });

  it("redirects unauthenticated users to /login", async () => {
    vi.spyOn(authApi, "me").mockRejectedValueOnce(new Error("401"));
    renderAt("/projects");
    expect(await screen.findByText(/Sign in to Portask/i)).toBeInTheDocument();
  });

  it("shows the admin dashboard and nav after authentication", async () => {
    renderAt("/");
    expect(await screen.findByText("Workspace dashboard")).toBeInTheDocument();
    expect(screen.getByText("Companies")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Talent")).toBeInTheDocument();
  });

  it("gives a manager the team, client, and talent tools but not the database one", async () => {
    vi.spyOn(authApi, "me").mockResolvedValueOnce({
      user: { id: "u3", email: "manager@portask.dev", name: "Mo Manager", role: "MANAGER" },
    });
    renderAt("/");
    expect(await screen.findByText("Workspace dashboard")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Companies")).toBeInTheDocument();
    expect(screen.getByText("Talent")).toBeInTheDocument();
    // /api/settings is ADMIN-only, so managers must not be offered a dead link.
    expect(screen.queryByText("Database")).not.toBeInTheDocument();
  });

  it("lets a manager open the talent list", async () => {
    vi.spyOn(authApi, "me").mockResolvedValueOnce({
      user: { id: "u3", email: "manager@portask.dev", name: "Mo Manager", role: "MANAGER" },
    });
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/dashboard")) {
        return Promise.resolve(
          okResponse({
            counts: { activeProjects: 0, riskProjects: 0, blockedTasks: 0, pendingDeliverables: 0 },
            recentUpdates: [],
            recentActivity: [],
            myTasks: [],
            tasksDueSoon: [],
            blockedMyTasks: [],
            upcomingMilestones: [],
          })
        );
      }
      if (url.includes("/api/talent")) {
        return Promise.resolve(okResponse({ talent: [] }));
      }
      if (url.includes("/api/projects")) return Promise.resolve(okResponse([]));
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    renderAt("/talent");
    expect(
      await screen.findByText(/freelancers who have marked themselves as available/i)
    ).toBeInTheDocument();
  });

  it("treats a freelancer as internal but not as management", async () => {
    vi.spyOn(authApi, "me").mockResolvedValueOnce({
      user: {
        id: "u4",
        email: "freelancer@portask.dev",
        name: "Freya Freelance",
        role: "FREELANCER",
        availableForWork: true,
      },
    });
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/dashboard")) {
        return Promise.resolve(
          okResponse({
            counts: { activeProjects: 0, riskProjects: 0, blockedTasks: 0, pendingDeliverables: 0 },
            recentUpdates: [],
            recentActivity: [],
            myTasks: [],
            tasksDueSoon: [],
            blockedMyTasks: [],
            upcomingMilestones: [],
          })
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    renderAt("/");
    expect(await screen.findByText("My dashboard")).toBeInTheDocument();
    // Internal-only nav item is present; the management section is not.
    expect(screen.getByText("Public reports")).toBeInTheDocument();
    expect(screen.queryByText("Team")).not.toBeInTheDocument();
    expect(screen.queryByText("Talent")).not.toBeInTheDocument();
  });

  it("keeps a freelancer off the team page", async () => {
    vi.spyOn(authApi, "me").mockResolvedValueOnce({
      user: { id: "u4", email: "freelancer@portask.dev", name: "Freya Freelance", role: "FREELANCER" },
    });
    renderAt("/team");
    // Redirected to the dashboard, which is the freelancer view.
    expect(await screen.findByText("My dashboard")).toBeInTheDocument();
  });

  it("allows admin to navigate to the Team page", async () => {
    renderAt("/");
    await userEvent.click(await screen.findByText("Team"));
    expect(await screen.findByText(/Users in the workspace/i)).toBeInTheDocument();
  });

  it("renders the client dashboard with activity without crashing", async () => {
    const client: User = {
      id: "u2",
      email: "client@portask.dev",
      name: "Cara Client",
      role: "CLIENT",
      companyId: "c1",
    };
    vi.spyOn(authApi, "me").mockResolvedValueOnce({ user: client });
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/dashboard")) {
        return Promise.resolve(
          okResponse({
            counts: { activeProjects: 1, riskProjects: 0, blockedTasks: 0, pendingDeliverables: 0 },
            recentUpdates: [],
            recentActivity: [
              {
                id: "a1",
                action: "TASK_CREATED",
                detail: "Build landing page",
                projectId: "p1",
                user: { id: "u1", name: "Ari Admin", role: "ADMIN" },
                project: { id: "p1", name: "Website" },
                createdAt: new Date().toISOString(),
              },
            ],
            myTasks: [],
            tasksDueSoon: [],
            blockedMyTasks: [],
            upcomingMilestones: [],
          })
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    renderAt("/");
    expect(await screen.findByText("Project dashboard")).toBeInTheDocument();
    expect(screen.getByText("Ari Admin")).toBeInTheDocument();
  });
});