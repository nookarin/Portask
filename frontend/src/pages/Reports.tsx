import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { projectsApi, reportsApi } from "../api";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Label,
  Modal,
  Spinner,
  formatDate,
  formatDateTime,
  formClass,
} from "../components/ui";
import type { ProgressReport, Project, PublicComment, PublicCommentStatus, ReportDetail } from "../types";

const commentTone: Record<PublicCommentStatus, "amber" | "green" | "red"> = {
  PENDING: "amber",
  APPROVED: "green",
  SPAM: "red",
};

export default function Reports() {
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<ProgressReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await reportsApi.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Public reports</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Curate a progress report and share it with anyone who has the link.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>New report</Button>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {loading ? (
        <Spinner />
      ) : reports.length === 0 ? (
        <EmptyState title="No reports yet" hint="Create a report to publish progress publicly." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <Card key={report.id} className="flex h-full flex-col">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="font-semibold text-slate-800 dark:text-slate-100">{report.title}</h2>
                <Badge tone={reportStatusTone(report)}>{reportStatusLabel(report)}</Badge>
              </div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{report.project?.name}</p>
              {report._count ? (
                <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
                  {report._count.updates} updates · {report._count.deliverables} deliverables ·{" "}
                  {report._count.comments} comments
                </p>
              ) : null}
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <Button onClick={() => setSelected(report)}>Manage</Button>
                <Button variant="secondary" onClick={() => void toggleEnabled(report)}>
                  {report.enabled ? "Revoke link" : "Enable link"}
                </Button>
                <a
                  href={`/r/${report.token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Open
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateReportModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(report) => {
          setShowCreate(false);
          void load();
          setSelected(report);
        }}
      />

      {selected ? (
        <ReportEditor
          report={selected}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </div>
  );
}

function reportStatusTone(report: ProgressReport): "green" | "amber" | "slate" {
  if (!report.enabled) return "slate";
  if (report.expiresAt && new Date(report.expiresAt).getTime() <= Date.now()) return "amber";
  return "green";
}

function reportStatusLabel(report: ProgressReport): string {
  if (!report.enabled) return "Revoked";
  if (report.expiresAt && new Date(report.expiresAt).getTime() <= Date.now()) return "Expired";
  return "Live";
}

async function toggleEnabled(report: ProgressReport) {
  try {
    await reportsApi.update(report.id, { enabled: !report.enabled });
  } catch {
    /* surfaced by the next list load */
  }
}

function CreateReportModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (report: ProgressReport) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    void projectsApi
      .list()
      .then((list) => {
        setProjects(list);
        if (list.length > 0) setProjectId((current) => current || list[0].id);
      })
      .catch(() => setError("Failed to load projects."));
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await reportsApi.create({
        projectId,
        title,
        intro: intro || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setTitle("");
      setIntro("");
      setExpiresAt("");
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New public report">
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}
        <div>
          <Label>Project</Label>
          <select className={formClass} value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Title</Label>
          <input className={formClass} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Intro (optional)</Label>
          <textarea className={formClass} rows={3} maxLength={5000} value={intro} onChange={(e) => setIntro(e.target.value)} />
        </div>
        <div>
          <Label>Link expires (optional)</Label>
          <input className={formClass} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Create report</Button>
        </div>
      </form>
    </Modal>
  );
}

function ReportEditor({
  report,
  onClose,
  onChanged,
}: {
  report: ProgressReport;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());
  const [selectedDeliverables, setSelectedDeliverables] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [savingCuration, setSavingCuration] = useState(false);

  const publicUrl = `${window.location.origin}/r/${report.token}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await reportsApi.get(report.id);
      setDetail(result);
      setSelectedUpdates(new Set(result.updates.map((u) => u.updateId)));
      setSelectedDeliverables(new Set(result.deliverables.map((d) => d.deliverableId)));
      setComments(result.comments);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [report.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function saveCuration() {
    setSavingCuration(true);
    setError("");
    try {
      await reportsApi.saveCuration(report.id, {
        updateIds: [...selectedUpdates],
        deliverableIds: [...selectedDeliverables],
      });
      onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save selection.");
    } finally {
      setSavingCuration(false);
    }
  }

  async function moderate(commentId: string, status: PublicCommentStatus) {
    try {
      await reportsApi.moderate(report.id, commentId, status);
      setComments(await reportsApi.comments(report.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update comment.");
    }
  }

  async function removeComment(commentId: string) {
    try {
      await reportsApi.deleteComment(report.id, commentId);
      setComments(await reportsApi.comments(report.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete comment.");
    }
  }

  const publicUpdates = detail?.availableUpdates.filter((u) => u.visibility === "CLIENT") ?? [];

  return (
    <Modal open onClose={onClose} title={report.title}>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <div>
          <Label>Public link</Label>
          <div className="flex items-center gap-2">
            <input className={formClass} readOnly value={publicUrl} onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(publicUrl)}
            >
              Copy
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Anyone with this link can view the report. Revoke it to cut off access immediately.
          </p>
        </div>

        {error ? <Alert>{error}</Alert> : null}
        {loading ? <Spinner /> : null}

        {!loading && detail ? (
          <>
            <div>
              <Label>Published updates ({selectedUpdates.size})</Label>
              {publicUpdates.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No client-visible updates on this project yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {publicUpdates.map((update) => (
                    <label
                      key={update.id}
                      className="flex items-start gap-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedUpdates.has(update.id)}
                        onChange={() => toggle(selectedUpdates, update.id, setSelectedUpdates)}
                      />
                      <span>
                        <span className="block font-medium text-slate-800 dark:text-slate-100">{update.title}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(update.createdAt)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Published deliverables ({selectedDeliverables.size})</Label>
              {detail.availableDeliverables.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No deliverables on this project yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {detail.availableDeliverables.map((deliverable) => (
                    <label
                      key={deliverable.id}
                      className="flex items-start gap-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedDeliverables.has(deliverable.id)}
                        onChange={() => toggle(selectedDeliverables, deliverable.id, setSelectedDeliverables)}
                      />
                      <span>
                        <span className="block font-medium text-slate-800 dark:text-slate-100">{deliverable.name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {deliverable.status.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={() => void saveCuration()} disabled={savingCuration}>
              {savingCuration ? "Saving..." : "Save selection"}
            </Button>

            <div>
              <Label>Comments ({comments.length})</Label>
              {comments.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">No comments yet.</div>
              ) : (
                <div className="space-y-2">
                  {comments.map((comment) => (
                    <div key={comment.id} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{comment.authorName}</span>
                        {comment.status ? (
                          <Badge tone={commentTone[comment.status]}>
                            {comment.status.toLowerCase()}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{comment.body}</p>
                      <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        {formatDateTime(comment.createdAt)}
                      </div>
                      <div className="mt-2 flex gap-2">
                        {comment.status !== "APPROVED" ? (
                          <Button variant="secondary" onClick={() => void moderate(comment.id, "APPROVED")}>
                            Approve
                          </Button>
                        ) : null}
                        {comment.status !== "SPAM" ? (
                          <Button variant="ghost" onClick={() => void moderate(comment.id, "SPAM")}>
                            Spam
                          </Button>
                        ) : null}
                        <Button variant="danger" onClick={() => void removeComment(comment.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}