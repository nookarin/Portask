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
  it("redirects unauthenticated users to /login", async () => {
    vi.spyOn(authApi, "me").mockRejectedValueOnce(new Error("401"));
    renderAt("/");
    expect(await screen.findByText(/Sign in to Portask/i)).toBeInTheDocument();
  });

  it("shows the admin dashboard and nav after authentication", async () => {
    renderAt("/");
    expect(await screen.findByText("Workspace dashboard")).toBeInTheDocument();
    expect(screen.getByText("Companies")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
  });

  it("allows admin to navigate to the Team page", async () => {
    renderAt("/");
    await userEvent.click(await screen.findByText("Team"));
    expect(await screen.findByText(/Users in the workspace/i)).toBeInTheDocument();
  });
});