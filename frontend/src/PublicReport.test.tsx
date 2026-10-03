import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { authApi } from "../src/api";
import type { PublicReportData, User } from "../src/types";

const client: User = {
  id: "u2",
  email: "client@portask.dev",
  name: "Cara Client",
  role: "CLIENT",
  companyId: "c1",
};

vi.spyOn(authApi, "me").mockResolvedValue({ user: client });

const now = new Date().toISOString();

const reportData: PublicReportData = {
  title: "Q3 Brand Refresh",
  intro: "Everything is on track.",
  project: {
    name: "Acme Rebrand",
    status: "ACTIVE",
    startDate: null,
    dueDate: null,
    progress: 60,
  },
  updates: [
    {
      id: "up1",
      title: "Logo concepts delivered",
      body: "Three directions shared with the team.",
      progress: 60,
      fileUrl: null,
      createdAt: now,
    },
  ],
  deliverables: [
    {
      id: "d1",
      name: "Brand deck",
      description: "v1 concepts",
      fileUrl: null,
      status: "AWAITING_CLIENT_REVIEW",
      createdAt: now,
    },
  ],
  comments: [],
  updatedAt: now,
};

const json = (data: unknown) => async () => data;
const okResponse = (data: unknown) =>
  ({ ok: true, status: 200, json: json(data) }) as Response;
const errorResponse = (status: number, message: string) =>
  ({ ok: false, status, statusText: message, json: json({ error: message }) }) as Response;

beforeEach(() => {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/me")) return Promise.resolve(errorResponse(401, "Not authenticated."));
    if (url.includes("/public/report/")) return Promise.resolve(okResponse(reportData));
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

describe("public progress report page", () => {
  it("renders the report for a visitor with no session", async () => {
    renderAt("/r/abcdefghijklmnopqrstuvwxyz012345");
    expect(await screen.findByText("Q3 Brand Refresh")).toBeInTheDocument();
    expect(screen.getByText(/Acme Rebrand/)).toBeInTheDocument();
    expect(screen.getByText("Logo concepts delivered")).toBeInTheDocument();
    expect(screen.getByText("Brand deck")).toBeInTheDocument();
  });

  it("does not redirect to login", async () => {
    renderAt("/r/abcdefghijklmnopqrstuvwxyz012345");
    await screen.findByText("Q3 Brand Refresh");
    expect(screen.queryByText(/Sign in to Portask/i)).not.toBeInTheDocument();
  });

  it("shows progress percentage", async () => {
    renderAt("/r/abcdefghijklmnopqrstuvwxyz012345");
    expect(await screen.findByText("60%")).toBeInTheDocument();
  });

  it("shows a friendly message when the link is unavailable", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return Promise.resolve(errorResponse(401, "Not authenticated."));
      if (url.includes("/public/report/")) {
        return Promise.resolve(errorResponse(404, "This report is not available."));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    renderAt("/r/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(await screen.findByText("Report unavailable")).toBeInTheDocument();
  });

  it("posts a comment without requiring a session", async () => {
    // Distinct origin+path so this mock cannot satisfy the view request.
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return Promise.resolve(errorResponse(401, "Not authenticated."));
      if (url.includes("/comments") && init?.method === "POST") {
        return Promise.resolve(
          okResponse({ id: "c1", authorName: "Visitor", body: "Great work", status: "PENDING", createdAt: now })
        );
      }
      if (url.includes("/public/report/")) return Promise.resolve(okResponse(reportData));
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderAt("/r/abcdefghijklmnopqrstuvwxyz012345");
    await screen.findByText("Q3 Brand Refresh");

    await userEvent.type(screen.getByLabelText(/Your name/i), "Visitor");
    await userEvent.type(screen.getByLabelText(/Comment/i), "Great work");
    await userEvent.click(screen.getByRole("button", { name: /Post comment/i }));

    expect(await screen.findByText(/your comment was submitted and is awaiting review/i)).toBeInTheDocument();
  });

  it("surfaces a comment rejection from the server", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return Promise.resolve(errorResponse(401, "Not authenticated."));
      if (url.includes("/comments") && init?.method === "POST") {
        return Promise.resolve(errorResponse(429, "Too many comments. Try again later."));
      }
      if (url.includes("/public/report/")) return Promise.resolve(okResponse(reportData));
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderAt("/r/abcdefghijklmnopqrstuvwxyz012345");
    await screen.findByText("Q3 Brand Refresh");

    await userEvent.type(screen.getByLabelText(/Your name/i), "Flooder");
    await userEvent.type(screen.getByLabelText(/Comment/i), "buy now");
    await userEvent.click(screen.getByRole("button", { name: /Post comment/i }));

    expect(await screen.findByText(/Too many comments/i)).toBeInTheDocument();
  });

  it("only exposes approved comments", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return Promise.resolve(errorResponse(401, "Not authenticated."));
      if (url.includes("/public/report/")) {
        return Promise.resolve(
          okResponse({
            ...reportData,
            comments: [{ id: "c1", authorName: "Visitor", body: "Approved note", createdAt: now }],
          })
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderAt("/r/abcdefghijklmnopqrstuvwxyz012345");
    expect(await screen.findByText("Approved note")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Visitor")).toBeInTheDocument());
  });
});