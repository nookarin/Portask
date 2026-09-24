import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { profileApi, uploadFile } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Alert, Badge, Button, Card, formClass, Label, Spinner } from "../components/ui";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  function showError(message: string) {
    setError(message);
    setSaved(false);
  }

  async function pickAvatar(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { url } = await uploadFile(file);
      await saveProfile({ name, avatarUrl: url });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to upload a profile picture.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function saveProfile(patch: { name?: string; avatarUrl?: string | null }) {
    setBusy(true);
    setError("");
    try {
      const { user: updated } = await profileApi.update(patch);
      setName(updated.name);
      setAvatarUrl(updated.avatarUrl ?? null);
      await refresh();
      setSaved(true);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await saveProfile({ name });
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await profileApi.update({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setSaved(true);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to change your password.");
    } finally {
      setBusy(false);
    }
  }

  const roleTone = user.role === "ADMIN" ? "purple" : user.role === "EMPLOYEE" ? "blue" : "green";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage how you appear and secure your account.
        </p>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {saved ? (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Changes saved.
        </div>
      ) : null}

      <Card>
        <div className="flex items-center gap-5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={user.name}
              className="h-20 w-20 rounded-full border border-slate-200 object-cover dark:border-slate-700"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
              {initials(user.name)}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{user.name}</span>
              <Badge tone={roleTone}>{user.role}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(ev) => void pickAvatar(ev)} />
              <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading || busy}>
                {uploading ? "Uploading…" : "Upload picture"}
              </Button>
              {avatarUrl ? (
                <Button variant="ghost" onClick={() => void saveProfile({ name, avatarUrl: null })} disabled={busy}>
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">Account details</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Name</Label>
            <input className={formClass} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <input className={formClass} value={user.email} disabled />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Email cannot be changed.</p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || name === user.name}>Save changes</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">Change password</h2>
        <form onSubmit={onChangePassword} className="space-y-4">
          <div>
            <Label>Current password</Label>
            <input
              className={formClass}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <Label>New password</Label>
            <input
              className={formClass}
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !currentPassword || newPassword.length < 8}>
              Update password
            </Button>
          </div>
        </form>
      </Card>

      {busy ? <Spinner label="Saving…" /> : null}
    </div>
  );
}