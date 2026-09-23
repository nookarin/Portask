import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  deliverablesApi,
  milestonesApi,
  projectsApi,
  tasksApi,
  updatesApi,
  uploadFile,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  formClass,
  Label,
  Modal,
  ProgressBar,
  Spinner,
  formatDateTime,
} from "../components/ui";
import type {
  ActivityLog,
  Deliverable,
  Project,
  ProjectUpdate,
  Task,
  TaskStatus,
} from "../types";

type Tab = "overview" | "tasks" | "updates" | "deliverables" | "activity";

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "updates", label: "Updates" },
  { id: "deliverables", label: "Deliverables" },
  { id: "activity", label: "Activity" },
];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!id) return;
    projectsApi
      .get(id)
      .then(setProject)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load project."));
  }, [id, reloadKey]);

  if (error) return <Alert>{error}</Alert>;
  if (!project) return <Spinner />;

  const isInternal = user!.role !== "CLIENT";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{project.name}</h1>
            <Badge tone={project.status === "ACTIVE" ? "green" : project.status === "ON_HOLD" ? "amber" : project.status === "PLANNING" ? "blue" : "slate"}>
              {project.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {project.company.name} · Due {formatDateTime(project.dueDate)}
          </p>
        </div>
        <div className="w-48">
          <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Progress</span>
            <span className="font-semibold">{project.progress}%</span>
          </div>
          <ProgressBar value={project.progress} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-b-2 border-brand-600 text-brand-600 dark:text-brand-400"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <Overview project={project} isInternal={isInternal} onChanged={reload} />
      ) : tab === "tasks" ? (
        <TasksTab project={project} isInternal={isInternal} onChanged={reload} />
      ) : tab === "updates" ? (
        <UpdatesTab project={project} isInternal={isInternal} onChanged={reload} />
      ) : tab === "deliverables" ? (
        <DeliverablesTab project={project} isInternal={isInternal} onChanged={reload} />
      ) : (
        <ActivityTab activities={project.activityLogs ?? []} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
      {children}
    </Card>
  );
}

function Overview({
  project,
  isInternal,
  onChanged,
}: {
  project: Project;
  isInternal: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  async function addMilestone(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await milestonesApi.create(project.id, name, due ? new Date(due).toISOString() : undefined);
      setName("");
      setDue("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Description">
        <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{project.description || "No description yet."}</p>
      </Section>

      <Section title="Team">
        {!project.members || project.members.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No members yet.</p>
        ) : (
          <ul className="space-y-2">
            {project.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800 dark:text-slate-100">{m.user.name}</span>
                <span className="text-xs capitalize text-slate-500 dark:text-slate-400">{m.user.email}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Milestones">
        {(project.milestones?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No milestones yet.</p>
        ) : (
          <ul className="space-y-2">
            {project.milestones!.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-800 dark:text-slate-100">{m.name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(m.dueDate)}</span>
              </li>
            ))}
          </ul>
        )}
        {isInternal ? (
          <form onSubmit={addMilestone} className="mt-4 flex gap-2">
            <input
              className={formClass}
              placeholder="Milestone name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input className={formClass} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <Button type="submit" disabled={busy}>Add</Button>
          </form>
        ) : null}
      </Section>
    </div>
  );
}

const taskStatusTone: Record<TaskStatus, "slate" | "blue" | "red" | "green"> = {
  TO_DO: "slate",
  IN_PROGRESS: "blue",
  BLOCKED: "red",
  DONE: "green",
};

function TasksTab({ project, isInternal, onChanged }: { project: Project; isInternal: boolean; onChanged: () => void }) {
  const tasks = project.tasks ?? [];
  const [showCreate, setShowCreate] = useState(false);

  async function changeStatus(task: Task, status: TaskStatus) {
    await tasksApi.update(task.id, { status });
    onChanged();
  }

  return (
    <div className="space-y-4">
      {isInternal ? (
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)}>New task</Button>
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" />
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Card key={t.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{t.title}</span>
                  <Badge tone={taskStatusTone[t.status]}>{t.status.replace("_", " ")}</Badge>
                  <Badge tone={t.priority === "HIGH" ? "red" : t.priority === "MEDIUM" ? "amber" : "slate"}>
                    {t.priority}
                  </Badge>
                  {t.clientVisible ? <Badge tone="blue">Client-visible</Badge> : null}
                </div>
                {t.description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.description}</p> : null}
                <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {t.assignee ? `Assigned to ${t.assignee.name}` : "Unassigned"}
                  {t.dueDate ? ` · Due ${formatDateTime(t.dueDate)}` : ""}
                </div>
              </div>
              {isInternal ? (
                <select
                  className={`${formClass} w-36`}
                  value={t.status}
                  onChange={(e) => void changeStatus(t, e.target.value as TaskStatus)}
                >
                  {(["TO_DO", "IN_PROGRESS", "BLOCKED", "DONE"] as TaskStatus[]).map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ")}</option>
                  ))}
                </select>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        project={project}
        onCreated={() => {
          setShowCreate(false);
          onChanged();
        }}
      />
    </div>
  );
}

function CreateTaskModal({
  open,
  onClose,
  project,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [assigneeId, setAssigneeId] = useState("");
  const [clientVisible, setClientVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await tasksApi.create(project.id, {
        title,
        description,
        priority,
        assigneeId: assigneeId || undefined,
        clientVisible,
      });
      setTitle("");
      setDescription("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New task">
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <div>
          <Label>Title</Label>
          <input className={formClass} required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <textarea className={formClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Priority</Label>
            <select className={formClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          <div>
            <Label>Assignee</Label>
            <select className={formClass} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {(project.members ?? []).map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
          Client-visible task
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Create task</Button>
        </div>
      </form>
    </Modal>
  );
}

function UpdatesTab({ project, isInternal, onChanged }: { project: Project; isInternal: boolean; onChanged: () => void }) {
  const updates = project.updates ?? [];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [progress, setProgress] = useState(0);
  const [visibility, setVisibility] = useState<"INTERNAL" | "CLIENT">("CLIENT");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function postUpdate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let fileUrl: string | undefined;
      if (file) fileUrl = (await uploadFile(file)).url;
      await updatesApi.create(project.id, { title, body, progress, visibility, fileUrl });
      setTitle("");
      setBody("");
      setFile(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {isInternal ? (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">Post an update</h2>
          <form onSubmit={postUpdate} className="space-y-3">
            {error ? <Alert>{error}</Alert> : null}
            <div>
              <Label>Title</Label>
              <input className={formClass} required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Notes</Label>
              <textarea className={formClass} rows={4} required value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Progress % ({progress})</Label>
                <input
                  className="w-full"
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Visibility</Label>
                <select className={formClass} value={visibility} onChange={(e) => setVisibility(e.target.value as "INTERNAL" | "CLIENT")}>
                  <option value="CLIENT">Client-visible</option>
                  <option value="INTERNAL">Internal only</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Attachment (optional)</Label>
              <input type="file" className={formClass} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button type="submit" disabled={busy}>Post update</Button>
          </form>
        </Card>
      ) : null}

      {updates.length === 0 ? (
        <EmptyState title="No updates yet" hint={isInternal ? "Post the first update above." : "Updates will appear here."} />
      ) : (
        <div className="space-y-3">
          {updates.map((u) => (
            <UpdateCard key={u.id} update={u} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

function UpdateCard({ update, onChanged }: { update: ProjectUpdate; onChanged: () => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updatesApi.comment(update.id, comment);
      setComment("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">{update.title}</h3>
        <div className="flex items-center gap-2">
          {update.visibility === "INTERNAL" ? <Badge tone="amber">Internal</Badge> : <Badge tone="green">Client-visible</Badge>}
          <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(update.createdAt)}</span>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{update.body}</p>
      <div className="mt-2 flex items-center gap-2">
        <ProgressBar value={update.progress} />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{update.progress}%</span>
      </div>
      {update.fileUrl ? (
        <a href={update.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-brand-600 dark:text-brand-400 hover:underline">
          📎 View attachment
        </a>
      ) : null}
      <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">Posted by {update.author.name}</div>

      <div className="mt-3 space-y-2 rounded-md bg-slate-50 dark:bg-slate-800/60 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Comments</div>
        {update.comments.length === 0 ? <p className="text-xs text-slate-500 dark:text-slate-400">No comments yet.</p> : null}
        {update.comments.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
            <span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{c.author.name}:</span>{" "}
              <span className="text-slate-600 dark:text-slate-300">{c.body}</span>
            </span>
            <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatDateTime(c.createdAt)}</span>
          </div>
        ))}
        <form onSubmit={submitComment} className="mt-2 flex gap-2">
          <input
            className={formClass}
            placeholder="Add a comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button type="submit" disabled={busy}>Comment</Button>
        </form>
      </div>
    </Card>
  );
}

function DeliverablesTab({ project, isInternal, onChanged }: { project: Project; isInternal: boolean; onChanged: () => void }) {
  const deliverables = project.deliverables ?? [];
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      {isInternal ? (
        <div className="flex justify-end">
          <Button onClick={() => setShowAdd(true)}>Upload deliverable</Button>
        </div>
      ) : null}

      {deliverables.length === 0 ? (
        <EmptyState title="No deliverables yet" />
      ) : (
        <div className="space-y-3">
          {deliverables.map((d) => (
            <DeliverableCard key={d.id} deliverable={d} isInternal={isInternal} onChanged={onChanged} />
          ))}
        </div>
      )}

      <AddDeliverableModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        projectId={project.id}
        onCreated={() => {
          setShowAdd(false);
          onChanged();
        }}
      />
    </div>
  );
}

const deliverableTone = (s: Deliverable["status"]) =>
  ({ DRAFT: "slate", AWAITING_CLIENT_REVIEW: "blue", APPROVED: "green", CHANGES_REQUESTED: "red" })[s] as
    | "slate"
    | "blue"
    | "green"
    | "red";

function DeliverableCard({
  deliverable,
  isInternal,
  onChanged,
}: {
  deliverable: Deliverable;
  isInternal: boolean;
  onChanged: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    await deliverablesApi.approve(deliverable.id);
    onChanged();
  }

  async function requestChanges() {
    setError("");
    if (!feedback.trim()) return;
    setBusy(true);
    try {
      await deliverablesApi.requestChanges(deliverable.id, feedback.trim());
      setFeedback("");
      setReviewing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await deliverablesApi.comment(deliverable.id, comment);
      setComment("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const awaiting = deliverable.status === "AWAITING_CLIENT_REVIEW";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">{deliverable.name}</h3>
        <Badge tone={deliverableTone(deliverable.status)}>{deliverable.status.replace(/_/g, " ")}</Badge>
      </div>
      {deliverable.description ? (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{deliverable.description}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        {deliverable.fileUrl ? (
          <a href={deliverable.fileUrl} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">
            View file
          </a>
        ) : null}
        {deliverable.deliveryLink ? (
          <a href={deliverable.deliveryLink} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">
            Delivery link
          </a>
        ) : null}
        <span className="text-xs text-slate-400 dark:text-slate-500">Uploaded by {deliverable.uploader.name} · {formatDateTime(deliverable.createdAt)}</span>
      </div>

      {deliverable.status === "CHANGES_REQUESTED" && deliverable.feedback ? (
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="font-semibold">Changes requested:</span> {deliverable.feedback}
        </div>
      ) : null}

      {!isInternal && awaiting ? (
        <div className="mt-3 rounded-md bg-slate-50 dark:bg-slate-800/60 p-3">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Review this deliverable</div>
          {!reviewing ? (
            <div className="mt-2 flex gap-2">
              <Button onClick={() => void approve()}>Approve</Button>
              <Button variant="secondary" onClick={() => setReviewing(true)}>Request changes</Button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <textarea
                className={formClass}
                rows={3}
                placeholder="What needs to change?"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
              {error ? <Alert>{error}</Alert> : null}
              <div className="flex gap-2">
                <Button onClick={() => void requestChanges()} disabled={busy}>Submit request</Button>
                <Button variant="ghost" onClick={() => setReviewing(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-3 space-y-2 rounded-md bg-slate-50 dark:bg-slate-800/60 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Comments</div>
        {deliverable.comments.length === 0 ? <p className="text-xs text-slate-500 dark:text-slate-400">No comments yet.</p> : null}
        {deliverable.comments.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
            <span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{c.author.name}:</span>{" "}
              <span className="text-slate-600 dark:text-slate-300">{c.body}</span>
            </span>
            <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatDateTime(c.createdAt)}</span>
          </div>
        ))}
        <form onSubmit={submitComment} className="mt-2 flex gap-2">
          <input className={formClass} placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button type="submit" disabled={busy}>Comment</Button>
        </form>
      </div>
    </Card>
  );
}

function AddDeliverableModal({
  open,
  onClose,
  projectId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deliveryLink, setDeliveryLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let fileUrl: string | undefined;
      if (file) fileUrl = (await uploadFile(file)).url;
      await deliverablesApi.create(projectId, { name, description, deliveryLink, fileUrl });
      setName("");
      setDescription("");
      setDeliveryLink("");
      setFile(null);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload deliverable">
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <div>
          <Label>Name</Label>
          <input className={formClass} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <textarea className={formClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label>File (optional)</Label>
          <input type="file" className={formClass} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <Label>Delivery link (optional)</Label>
          <input className={formClass} type="url" value={deliveryLink} onChange={(e) => setDeliveryLink(e.target.value)} placeholder="https://…" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Upload</Button>
        </div>
      </form>
    </Modal>
  );
}

function ActivityTab({ activities }: { activities: ActivityLog[] }) {
  if (activities.length === 0) return <EmptyState title="No activity recorded yet" />;
  return (
    <Card>
      <ol className="relative space-y-4 border-l border-slate-200 dark:border-slate-800 pl-4">
        {activities.map((a) => (
          <li key={a.id} className="text-sm">
            <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-brand-600 bg-white dark:bg-slate-900" />
            <span className="font-medium text-slate-800 dark:text-slate-100">{a.user.name}</span>{" "}
            <span className="text-slate-500 dark:text-slate-400">{a.action.replace(/_/g, " ").toLowerCase()}</span>
            {a.detail ? <span className="text-slate-400 dark:text-slate-500"> — {a.detail}</span> : null}
            <div className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(a.createdAt)}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}