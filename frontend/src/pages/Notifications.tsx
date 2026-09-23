import { useEffect, useState } from "react";
import { notificationsApi } from "../api";
import { Badge, Button, Card, EmptyState, Spinner, formatDateTime } from "../components/ui";
import type { Notification } from "../types";

export default function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      setItems(await notificationsApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markAllRead() {
    await notificationsApi.markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Notifications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{unread} unread</p>
        </div>
        {unread > 0 ? <Button variant="secondary" onClick={() => void markAllRead()}>Mark all read</Button> : null}
      </div>

      {error ? <div className="text-red-600 dark:text-red-400">{error}</div> : null}
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No notifications" hint="You're all caught up." />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id} className={`flex items-start justify-between gap-3 ${n.read ? "opacity-60" : ""}`}>
              <p className="text-sm text-slate-700 dark:text-slate-200">{n.message}</p>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(n.createdAt)}</span>
                {n.read ? <Badge>Read</Badge> : <Badge tone="blue">New</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}