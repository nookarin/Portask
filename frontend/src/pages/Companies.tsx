import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { companiesApi } from "../api";
import { Alert, Button, Card, EmptyState, formClass, Label, Modal, Spinner } from "../components/ui";
import type { Company } from "../types";

export default function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setCompanies(await companiesApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load companies.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Companies</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Client companies in the workspace.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>New company</Button>
      </div>

      {error ? <div className="text-red-600 dark:text-red-400">{error}</div> : null}
      {loading ? (
        <Spinner />
      ) : companies.length === 0 ? (
        <EmptyState title="No companies yet" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {companies.map((c) => (
            <Card key={c.id}>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">{c.name}</h2>
              {c._count ? (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {c._count.users} user(s) · {c._count.projects} project(s)
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <CreateCompanyModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          void load();
        }}
      />
    </div>
  );
}

function CreateCompanyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await companiesApi.create(name);
      setName("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New company">
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <div>
          <Label>Company name</Label>
          <input className={formClass} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Create company</Button>
        </div>
      </form>
    </Modal>
  );
}