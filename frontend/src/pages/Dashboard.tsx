import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dashboardApi } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Badge, Card, EmptyState, ProgressBar, Spinner, StatCard, formatDateTime } from "../components/ui";
import type { DashboardData, Task } from "../types";

const taskTone = (s: Task["status"]) =>
  ({ TO_DO: "slate", IN_PROGRESS: "blue", BLOCKED: "red", DONE: "green" })[s] as
    | "slate"
    | "blue"
    | "red"
    | "green";

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    dashboardApi
      .get()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard."));
  }, []);

  if (error) return <div className="text-red-600 dark:text-red-400">{error}</div>;
  if (!data) return <Spinner />;

  const { counts } = data;
  const role = user!.role;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          {role === "ADMIN" ? "Workspace dashboard" : role === "EMPLOYEE" ? "My dashboard" : "Project dashboard"}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Everything that needs your attention, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active projects" value={counts.activeProjects} />
        <StatCard label="At risk / overdue" value={counts.riskProjects} tone={counts.riskProjects > 0 ? "amber" : "green"} />
        <StatCard label="Blocked tasks" value={counts.blockedTasks} tone={counts.blockedTasks > 0 ? "red" : "green"} />
        <StatCard
          label="Awaiting review"
          value={counts.pendingDeliverables}
          tone={counts.pendingDeliverables > 0 ? "amber" : "green"}
        />
      </div>

      {role === "EMPLOYEE" ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">My tasks</h2>
          {data.myTasks.length === 0 ? (
            <EmptyState title="No tasks assigned yet" />
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.myTasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <Link to={`/projects/${t.project.id}`} className="font-medium text-slate-800 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400">
                        {t.title}
                      </Link>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t.project.name}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {t.dueDate ? <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(t.dueDate)}</span> : null}
                      <Badge tone={taskTone(t.status)}>{t.status.replace("_", " ")}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {data.tasksDueSoon.length > 0 ? (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">{data.tasksDueSoon.length} task(s) due within 7 days.</p>
          ) : null}
        </section>
      ) : null}

      {role === "CLIENT" ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Latest updates</h2>
          <div className="space-y-3">
            {data.recentUpdates.length === 0 ? <EmptyState title="No updates yet" /> : null}
            {data.recentUpdates.map((u) => (
              <Card key={u.id}>
                <Link to={`/projects/${u.project.id}`} className="font-semibold text-slate-800 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400">
                  {u.title}
                </Link>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{u.body}</div>
                <div className="mt-2 flex items-center gap-2">
                  <ProgressBar value={u.progress} />
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{u.progress}%</span>
                </div>
                <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  {u.project.name} · {formatDateTime(u.createdAt)}
                </div>
              </Card>
            ))}
          </div>

          {data.upcomingMilestones.length > 0 ? (
            <div className="mt-6">
              <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Upcoming milestones</h2>
              <Card>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.upcomingMilestones.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-slate-800 dark:text-slate-100">{m.name}</span>
                      <span className="text-slate-500 dark:text-slate-400">{m.project.name} · {formatDateTime(m.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
          {role === "CLIENT" ? "Project activity" : "Recent activity"}
        </h2>
        {data.recentActivity.length === 0 ? (
          <EmptyState title="No activity recorded yet" />
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                  <div>
                    <span className="font-medium text-slate-800 dark:text-slate-100">{a.user.name}</span>{" "}
                    <span className="text-slate-500 dark:text-slate-400">{a.action.replace(/_/g, " ").toLowerCase()}</span>
                    {a.detail ? <span className="text-slate-400 dark:text-slate-500"> — {a.detail}</span> : null}
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                    <div>{formatDateTime(a.createdAt)}</div>
                    {"project" in a && a.project ? <div className="text-brand-600 dark:text-brand-400">{a.project?.name}</div> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}