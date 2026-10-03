import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicReportsApi } from "../api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  Spinner,
  formClass,
  formatDate,
  formatDateTime,
} from "../components/ui";
import ThemeToggle from "../components/ThemeToggle";
import type { PublicComment, PublicReportData } from "../types";

const deliverableTone: Record<string, "slate" | "green" | "amber" | "red"> = {
  DRAFT: "slate",
  APPROVED: "green",
  AWAITING_CLIENT_REVIEW: "amber",
  CHANGES_REQUESTED: "red",
};

const deliverableLabel: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  AWAITING_CLIENT_REVIEW: "Awaiting review",
  CHANGES_REQUESTED: "Changes requested",
};

export default function PublicReport() {
  const { token = "" } = useParams();
  const [data, setData] = useState<PublicReportData | null>(null);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await publicReportsApi.view(token);
      setData(result);
      setComments(result.comments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This report is not available.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.title = data ? `${data.title} — Progress Report` : "Progress Report";
  }, [data]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await publicReportsApi.comment(token, { authorName: name, body });
      setBody("");
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not post your comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">P</div>
            <span className="text-lg font-bold text-slate-800 dark:text-slate-100">Portask</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {loading ? <Spinner label="Loading report..." /> : null}

        {!loading && error ? (
          <EmptyState title="Report unavailable" hint={error} />
        ) : null}

        {!loading && !error && data ? (
          <>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{data.title}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {data.project.name} · Updated {formatDateTime(data.updatedAt)}
              </p>
              {data.intro ? (
                <p className="mt-3 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{data.intro}</p>
              ) : null}
            </div>

            <Card>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-200">Overall progress</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{data.project.progress}%</span>
              </div>
              <ProgressBar value={data.project.progress} />
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Status: {data.project.status.replace("_", " ").toLowerCase()}</span>
                {data.project.dueDate ? <span>Due {formatDate(data.project.dueDate)}</span> : null}
              </div>
            </Card>

            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-800 dark:text-slate-100">Updates</h2>
              {data.updates.length === 0 ? (
                <EmptyState title="No updates published yet" />
              ) : (
                <div className="space-y-3">
                  {data.updates.map((update) => (
                    <Card key={update.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">{update.title}</h3>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(update.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                        {update.body}
                      </p>
                      {update.fileUrl ? (
                        <a
                          href={update.fileUrl}
                          className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          View attachment
                        </a>
                      ) : null}
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-800 dark:text-slate-100">Deliverables</h2>
              {data.deliverables.length === 0 ? (
                <EmptyState title="No deliverables published yet" />
              ) : (
                <div className="space-y-3">
                  {data.deliverables.map((deliverable) => (
                    <Card key={deliverable.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">{deliverable.name}</h3>
                        <Badge tone={deliverableTone[deliverable.status] ?? "slate"}>
                          {deliverableLabel[deliverable.status] ?? deliverable.status}
                        </Badge>
                      </div>
                      {deliverable.description ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                          {deliverable.description}
                        </p>
                      ) : null}
                      {deliverable.fileUrl ? (
                        <a
                          href={deliverable.fileUrl}
                          className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Download
                        </a>
                      ) : null}
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-bold text-slate-800 dark:text-slate-100">Comments</h2>
              {comments.length === 0 ? (
                <EmptyState title="No comments yet" hint="Be the first to leave a comment." />
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <Card key={comment.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {comment.authorName}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDateTime(comment.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                        {comment.body}
                      </p>
                    </Card>
                  ))}
                </div>
              )}

              <Card className="mt-4">
                {submitted ? (
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Thanks — your comment was submitted and is awaiting review.
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label htmlFor="comment-name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                        Your name
                      </label>
                      <input
                        id="comment-name"
                        className={formClass}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={80}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="comment-body" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                        Comment
                      </label>
                      <textarea
                        id="comment-body"
                        className={formClass}
                        rows={4}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        maxLength={2000}
                        required
                      />
                    </div>
                    {formError ? <div className="text-sm text-red-600 dark:text-red-400">{formError}</div> : null}
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Submitting..." : "Post comment"}
                    </Button>
                  </form>
                )}
              </Card>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}