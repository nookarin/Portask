import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { projectsApi, talentApi } from "../api";
import { Alert, Badge, Button, Card, EmptyState, formClass, Label, Modal, Spinner } from "../components/ui";
import type { Project, User } from "../types";

/**
 * Internal staffing list: freelancers who have flagged themselves as available.
 *
 * Assignment reuses `POST /api/projects/:id/members`, the same endpoint the project
 * detail page uses, so there is exactly one way to put somebody on a project and no
 * second membership model to keep in sync.
 */
export default function Talent() {
  const [talent, setTalent] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assigning, setAssigning] = useState<User | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([talentApi.list(), projectsApi.list()]);
      setTalent(t.talent);
      setProjects(p);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load available talent.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Talent</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Freelancers who have marked themselves as available for work.
        </p>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {loading ? (
        <Spinner />
      ) : talent.length === 0 ? (
        <EmptyState
          title="Nobody is available right now"
          hint="Freelancers set this from their own profile."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {talent.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-100">{t.name}</span>
                    <Badge tone="green">Available</Badge>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{t.email}</div>
                  {t.bio ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t.bio}</p> : null}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => setAssigning(t)}
                  disabled={projects.length === 0}
                >
                  Add to project
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AssignModal
        talent={assigning}
        projects={projects}
        onClose={() => setAssigning(null)}
        onAssigned={() => {
          setAssigning(null);
          void load();
        }}
      />
    </div>
  );
}

function AssignModal({
  talent,
  projects,
  onClose,
  onAssigned,
}: {
  talent: User | null;
  projects: Project[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (talent && projects.length > 0) {
      setProjectId(projects[0].id);
      setError("");
    }
  }, [talent, projects]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!talent) return;
    setBusy(true);
    setError("");
    try {
      await projectsApi.addMember(projectId, talent.id);
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add them to the project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={talent !== null} onClose={onClose} title={`Add ${talent?.name ?? ""} to a project`}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <div>
          <Label>Project</Label>
          <select className={formClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || projects.length === 0}>Add to project</Button>
        </div>
      </form>
    </Modal>
  );
}
