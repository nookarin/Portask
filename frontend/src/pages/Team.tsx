import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { companiesApi, usersApi } from "../api";
import { Alert, Badge, Button, Card, EmptyState, formClass, Label, Modal, Spinner } from "../components/ui";
import type { Company, Role } from "../types";

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  company?: { id: string; name: string } | null;
}

const roleTone: Record<Role, "blue" | "green" | "purple"> = {
  ADMIN: "purple",
  EMPLOYEE: "blue",
  CLIENT: "green",
};

export default function Team() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [u, c] = await Promise.all([usersApi.list(), companiesApi.list()]);
      setUsers(u as unknown as ManagedUser[]);
      setCompanies(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function removeUser(id: string) {
    if (!window.confirm("Remove this user?")) return;
    await usersApi.remove(id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Team</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Users in the workspace.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Invite user</Button>
      </div>

      {error ? <div className="text-red-600 dark:text-red-400">{error}</div> : null}
      {loading ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState title="No users yet" />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-100">{u.name}</span>
                    <Badge tone={roleTone[u.role]}>{u.role}</Badge>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{u.email}</div>
                  {u.company ? <div className="text-xs text-slate-400 dark:text-slate-500">{u.company.name}</div> : null}
                </div>
                <Button variant="ghost" onClick={() => void removeUser(u.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <InviteUserModal
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

function InviteUserModal({
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [companyId, setCompanyId] = useState("");
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
      await usersApi.create({
        name,
        email,
        password,
        role,
        companyId: role === "CLIENT" ? companyId : undefined,
      });
      setName("");
      setEmail("");
      setPassword("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite user">
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <div>
          <Label>Name</Label>
          <input className={formClass} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Email</Label>
          <input className={formClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>Temporary password</Label>
          <input className={formClass} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <Label>Role</Label>
          <select className={formClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="EMPLOYEE">Employee</option>
            <option value="CLIENT">Client</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        {role === "CLIENT" ? (
          <div>
            <Label>Company</Label>
            <select className={formClass} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="" disabled>Select a company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Invite user</Button>
        </div>
      </form>
    </Modal>
  );
}