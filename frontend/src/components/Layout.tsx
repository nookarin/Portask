import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import ThemeToggle from "./ThemeToggle";

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/projects", label: "Projects" },
  { to: "/notifications", label: "Notifications" },
];

const adminItems: { to: string; label: string; end?: boolean }[] = [
  { to: "/companies", label: "Companies" },
  { to: "/team", label: "Team" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const linkBase = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2 text-sm font-medium ${
      isActive ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:block">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">P</div>
          <span className="text-lg font-bold text-slate-800 dark:text-slate-100">Portask</span>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkBase}>
              {item.label}
            </NavLink>
          ))}
          {user.role === "ADMIN" ? (
            <>
              <div className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Admin</div>
              {adminItems.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkBase}>
                  {item.label}
                </NavLink>
              ))}
            </>
          ) : null}
        </nav>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <div className="md:hidden font-bold text-slate-800 dark:text-slate-100">Portask</div>
          <div className="hidden text-sm text-slate-500 dark:text-slate-400 md:block">
            {user.role === "CLIENT" ? user.company?.name ?? "Client" : "Workspace"}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="text-right text-sm">
              <div className="font-semibold text-slate-800 dark:text-slate-100">{user.name}</div>
              <div className="text-xs capitalize text-slate-500 dark:text-slate-400">{user.role.toLowerCase()}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
              {initials}
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}