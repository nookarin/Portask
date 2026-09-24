import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { calendarApi } from "../api";
import { Button, EmptyState, Spinner } from "../components/ui";
import type { CalendarEvent, CalendarEventType } from "../types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const typeStyle: Record<
  CalendarEventType,
  { dot: string; chip: string; label: string }
> = {
  TASK: {
    dot: "bg-blue-500",
    chip: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30",
    label: "Tasks",
  },
  MILESTONE: {
    dot: "bg-violet-500",
    chip: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30",
    label: "Milestones",
  },
  PROJECT: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30",
    label: "Projects",
  },
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function utcKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function Calendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    const start = new Date(Date.UTC(year, month, 1)).toISOString();
    const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)).toISOString();
    calendarApi
      .get({ start, end })
      .then((result) => {
        if (!active) return;
        setEvents(result);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load calendar.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [year, month]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = utcKey(new Date(ev.date));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.type.localeCompare(b.type));
    }
    return map;
  }, [events]);

  const cells = useMemo<Date[]>(() => {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const out: Date[] = [];
    for (let i = 0; i < first; i++) {
      out.push(new Date(Date.UTC(year, month, i - first + 1)));
    }
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(new Date(Date.UTC(year, month, d)));
    }
    while (out.length % 7 !== 0) {
      const last = out[out.length - 1];
      out.push(new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() + 1)));
    }
    return out;
  }, [year, month]);

  function move(delta: number) {
    const base = new Date(Date.UTC(year, month + delta, 1));
    setYear(base.getUTCFullYear());
    setMonth(base.getUTCMonth());
  }

  function goToday() {
    const t = new Date();
    setYear(t.getUTCFullYear());
    setMonth(t.getUTCMonth());
  }

  const todayKey = utcKey(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Calendar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tasks, milestones, and project dates at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => move(-1)}>
            ‹ Prev
          </Button>
          <Button variant="ghost" onClick={goToday}>
            Today
          </Button>
          <Button variant="secondary" onClick={() => move(1)}>
            Next ›
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-300">
        <span className="text-base font-bold text-slate-800 dark:text-slate-100">{monthLabel(year, month)}</span>
        <span className="flex items-center gap-3">
          {(Object.keys(typeStyle) as CalendarEventType[]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${typeStyle[t].dot}`} />
              {typeStyle[t].label}
            </span>
          ))}
        </span>
      </div>

      {error ? <div className="text-red-600 dark:text-red-400">{error}</div> : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date) => {
            const key = utcKey(date);
            const list = byDate.get(key) ?? [];
            const inMonth = date.getUTCMonth() === month;
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 last:border-r-0 odd:border-l-0 dark:border-slate-800 ${
                  inMonth ? "" : "bg-slate-50 dark:bg-slate-950/60"
                }`}
              >
                <div
                  className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday
                      ? "bg-brand-600 text-white"
                      : inMonth
                        ? "text-slate-700 dark:text-slate-200"
                        : "text-slate-400 dark:text-slate-600"
                  }`}
                >
                  {date.getUTCDate()}
                </div>
                <div className="space-y-1">
                  {list.slice(0, 3).map((ev) => (
                    <Link
                      key={ev.id}
                      to={`/projects/${ev.projectId}`}
                      title={`${ev.type.toLowerCase()} · ${ev.projectName}${ev.assigneeName ? ` · ${ev.assigneeName}` : ""}`}
                      className={`block truncate rounded border px-1.5 py-0.5 text-[11px] font-medium leading-tight hover:opacity-75 ${typeStyle[ev.type].chip}`}
                    >
                      {ev.title}
                    </Link>
                  ))}
                  {list.length > 3 ? (
                    <div className="px-1 text-[11px] text-slate-500 dark:text-slate-400">
                      +{list.length - 3} more
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : events.length === 0 ? (
        <EmptyState
          title="Nothing scheduled this month"
          hint="Due dates on tasks, milestones, and projects will appear here."
        />
      ) : null}
    </div>
  );
}