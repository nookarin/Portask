import { useEffect, useState } from "react";
import { settingsApi } from "../api";
import { Alert, Badge, Button, Card, formClass, Label, Spinner } from "../components/ui";
import type { DbPreset, DbProvider, DbSettingsInput } from "../types";

const PRESET_OPTIONS: { value: DbPreset; title: string; description: string }[] = [
  { value: "sqlite", title: "Local Database", description: "SQLite file stored on the server" },
  { value: "postgresql", title: "PostgreSQL", description: "Self-hosted or managed Postgres" },
  { value: "mongodb", title: "MongoDB", description: "MongoDB / Atlas (requires replica set)" },
  { value: "mysql", title: "MySQL", description: "MySQL or MariaDB server" },
  { value: "custom", title: "Other / Custom URL", description: "Any Prisma-compatible connection string" },
];

const PORT_DEFAULTS: Partial<Record<DbProvider, number>> = {
  postgresql: 5432,
  mysql: 3306,
  mongodb: 27017,
};

export default function Settings() {
  const [current, setCurrent] = useState<Awaited<ReturnType<typeof settingsApi.db>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [preset, setPreset] = useState<DbPreset>("postgresql");
  const [customProvider, setCustomProvider] = useState<DbProvider>("mysql");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState<string>(String(PORT_DEFAULTS.postgresql));
  const [database, setDatabase] = useState("portask");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [folder, setFolder] = useState("data");
  const [filename, setFilename] = useState("portask.db");
  const [connectionString, setConnectionString] = useState("");
  const [force, setForce] = useState(false);

  const [testing, setTesting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [testResult, setTestResult] = useState<string>("");
  const [applyMsg, setApplyMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const status = await settingsApi.db();
      setCurrent(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load database settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function selectPreset(p: DbPreset) {
    setPreset(p);
    setTestResult("");
    setApplyMsg("");
    const portDefault = p === "postgresql" || p === "mysql" || p === "mongodb" ? PORT_DEFAULTS[p] : undefined;
    if (portDefault) setPort(String(portDefault));
  }

  function buildInput(): DbSettingsInput {
    switch (preset) {
      case "sqlite":
        return { preset, folder, database: filename };
      case "postgresql":
      case "mysql":
        return { preset, host, port: port ? Number(port) : undefined, database, user, password };
      case "mongodb":
        return { preset, connectionString };
      case "custom":
        return { preset, customProvider, connectionString };
    }
  }

async function doTest() {
    setTesting(true);
    setTestResult("");
    setError("");
    try {
      const res = await settingsApi.test(buildInput());
      setTestResult(`Connection successful (${res.label}).`);
    } catch (err) {
      setTestResult("");
      setError(err instanceof Error ? err.message : "Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function doApply() {
    if (
      !window.confirm(
        "Switch the application to this database? The schema will be created there and the app will reconnect immediately. Existing data is NOT migrated."
      )
    )
      return;
    setApplying(true);
    setApplyMsg("");
    setError("");
    try {
      const status = await settingsApi.apply(buildInput(), force);
      setCurrent(status);
      setApplyMsg(`Database switched to ${status.label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch database.");
    } finally {
      setApplying(false);
    }
  }

  async function onReset() {
    if (!window.confirm("Revert to the default database (from DATABASE_URL)?")) return;
    setResetting(true);
    setError("");
    setApplyMsg("");
    try {
      const status = await settingsApi.reset();
      setCurrent(status);
      setApplyMsg(`Reverted to the default database (${status.label}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset the database.");
    } finally {
      setResetting(false);
    }
  }

  const isServer = preset === "postgresql" || preset === "mysql";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Database settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Connect Portask to the database of your choice. The default PostgreSQL setup is left untouched until you switch.
        </p>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {applyMsg ? (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          {applyMsg}
        </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800 dark:text-slate-100">Current database</span>
                <Badge tone={current?.healthy ? "green" : "red"}>
                  {current?.healthy ? "Connected" : "Offline"}
                </Badge>
                <Badge tone={current?.source === "custom" ? "purple" : "slate"}>
                  {current?.source === "custom" ? "Custom" : "Default"}
                </Badge>
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {current?.label ?? "—"} {current ? `(${current.provider})` : ""}
              </div>
              <div className="mt-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">
                {current?.connection}
              </div>
              {current?.configuredAt ? (
                <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Configured {new Date(current.configuredAt).toLocaleString()}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Config file: {current?.configPath}
              </div>
            </div>
            {current?.source === "custom" ? (
              <Button variant="secondary" onClick={() => void onReset()} disabled={resetting}>
                {resetting ? "Resetting..." : "Reset to default"}
              </Button>
            ) : null}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-bold text-slate-800 dark:text-slate-100">Configure database</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doApply();
          }}
          className="space-y-5"
        >
          <div>
            <Label>Database type</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => selectPreset(opt.value)}
                  className={`rounded-md border p-3 text-left transition-colors ${
                    preset === opt.value
                      ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-500/10"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                  }`}
                >
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{opt.title}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>

          {preset === "sqlite" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Storage folder (relative to the app)</Label>
                <input className={formClass} value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="data" />
              </div>
              <div>
                <Label>Database file name</Label>
                <input className={formClass} value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="portask.db" />
              </div>
            </div>
          ) : null}

          {isServer ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Host</Label>
                <input className={formClass} value={host} onChange={(e) => setHost(e.target.value)} required />
              </div>
              <div>
                <Label>Port</Label>
                <input className={formClass} type="number" value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
              <div>
                <Label>Database name</Label>
                <input className={formClass} value={database} onChange={(e) => setDatabase(e.target.value)} required />
              </div>
              <div>
                <Label>User</Label>
                <input className={formClass} value={user} onChange={(e) => setUser(e.target.value)} />
              </div>
              <div>
                <Label>Password</Label>
                <input className={formClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
          ) : null}

          {preset === "mongodb" ? (
            <div>
              <Label>Connection string</Label>
              <input
                className={formClass}
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                placeholder="mongodb+srv://user:pass@cluster.example.net/portask"
                required
              />
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                MongoDB requires a replica set (MongoDB Atlas includes one automatically).
              </p>
            </div>
          ) : null}

          {preset === "custom" ? (
            <div className="space-y-4">
              <div>
                <Label>Engine / provider</Label>
                <select className={formClass} value={customProvider} onChange={(e) => setCustomProvider(e.target.value as DbProvider)}>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="sqlite">SQLite</option>
                  <option value="mongodb">MongoDB</option>
                </select>
              </div>
              <div>
                <Label>Full connection string</Label>
                <textarea
                  className={formClass}
                  rows={2}
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  placeholder="postgresql://user:pass@host:5432/db"
                  required
                />
              </div>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Allow destructive schema changes (accept data loss if the existing schema differs)
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => void doTest()} disabled={testing}>
              {testing ? "Testing..." : "Test connection"}
            </Button>
            <Button type="submit" disabled={applying}>
              {applying ? "Applying..." : "Apply & switch database"}
            </Button>
            {testResult ? (
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{testResult}</span>
            ) : null}
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Switching creates the schema in the target database and reconnects immediately. Existing data is not moved
            between databases.
          </p>
        </form>
      </Card>
    </div>
  );
}