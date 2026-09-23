import { useAuth } from "../auth/AuthContext";
import { Badge, Card } from "../components/ui";

export default function Profile() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Profile</h1>
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
            {user.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{user.name}</span>
              <Badge tone={user.role === "ADMIN" ? "purple" : user.role === "EMPLOYEE" ? "blue" : "green"}>
                {user.role}
              </Badge>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{user.email}</div>
            {user.company ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">Company: {user.company.name}</div>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}