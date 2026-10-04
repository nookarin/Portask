import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ThemeProvider } from "./theme/ThemeContext";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Calendar from "./pages/Calendar";
import Companies from "./pages/Companies";
import Team from "./pages/Team";
import Talent from "./pages/Talent";
import Settings from "./pages/Settings";
import PublicReport from "./pages/PublicReport";
import Reports from "./pages/Reports";
import { isManagementRole } from "./types";
import type { ReactNode } from "react";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/**
 * Agency management: team, clients, project deletion. `Settings` nests its own
 * stricter ADMIN-only check, so managers reach the app but not the settings screen.
 */
function ManagementOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!isManagementRole(user?.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function InternalOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user || user.role === "CLIENT") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
            <Route path="/r/:token" element={<PublicReport />} />

            <Route
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/reports" element={<InternalOnly><Reports /></InternalOnly>} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/profile" element={<Profile />} />

              <Route
                path="/companies"
                element={
                  <ManagementOnly>
                    <Companies />
                  </ManagementOnly>
                }
              />
              <Route
                path="/team"
                element={
                  <ManagementOnly>
                    <Team />
                  </ManagementOnly>
                }
              />
              <Route
                path="/talent"
                element={
                  <ManagementOnly>
                    <Talent />
                  </ManagementOnly>
                }
              />
              {import.meta.env.DEV ? (
                <Route
                  path="/settings"
                  element={
                    <AdminOnly>
                      <Settings />
                    </AdminOnly>
                  }
                />
              ) : null}
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}