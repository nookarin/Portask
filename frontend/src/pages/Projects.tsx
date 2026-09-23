import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { companiesApi, projectsApi } from "../api";
import { useAuth } from "../auth/AuthContext";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  formClass,
  Label,
  Modal,
  ProgressBar,
  Spinner,
} from "../components/ui";
import type { Company, Project, ProjectStatus } from "../types";

const statusTone: Record<ProjectStatus, "blue" | "green" | "amber" | "slate"> = {
  PLANNING: "blue",
  ACTIVE: "green",
  ON_HOLD: "amber",
  COMPLETED: "slate",
};

export default function Projects() {
  const { user } = useAuth();
  const isInternal = user!.role !== "CLIENT";

  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        projectsApi.list(),
        isInternal ? companiesApi.list() : Promise.resolve([]),
      ]);
      setProjects(p);
      setCompanies(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = projects.filter((p) =>
    `${p.name}${p.company?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Projects</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {user!.role === "CLIENT"
              ? "Projects for your company."
              : "All client projects in the workspace."}
          </p>
        </div>
        {isInternal ? (
          <Button onClick={() => setShowCreate(true)}>New project</Button>
        ) : null}
      </div>

      <input
        className={`${formClass} max-w-sm`}
        placeholder="Search projects…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search projects"
      />

      {error ? <div className="text-red-600 dark:text-red-400">{error}</div> : null}
      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState title="No projects match" hint={q ? "Try a different search." : "Create a project to get started."} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-slate-800 dark:text-slate-100">{p.name}</h2>
                  <Badge tone={statusTone[p.status]}>{p.status.replace("_", " ")}</Badge>
                </div>
                <p className="mb-3 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                  {p.description || "No description."}
                </p>
                <div className="mb-2 flex items-center gap-2">
                  <ProgressBar value={p.progress} />
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{p.progress}%</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                  <span>{p.company?.name}</span>
                  {p._count ? (
                    <span>{p._count.tasks} tasks · {p._count.updates} updates</span>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        companies={companies}
        onCreated={() => {
          setShowCreate(false);
          void load();
        }}
      />
    </div>
  );
}

function CreateProjectModal({
  open,
  onClose,
  companies,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  companies: Company[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && companies.length > 0 && !companyId) setCompanyId(companies[0].id);
  }, [open, companies, companyId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await projectsApi.create({ name, description, companyId, dueDate: dueDate ? new Date(dueDate).toISOString() : undefined });
      setName("");
      setDescription("");
      setDueDate("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}
        <div>
          <Label>Project name</Label>
          <input className={formClass} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <textarea
            className={formClass}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label>Client company</Label>
          <select className={formClass} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="" disabled>Select a company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Due date</Label>
          <input className={formClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Create project</Button>
        </div>
      </form>
    </Modal>
  );
}