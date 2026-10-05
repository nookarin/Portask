import { Link } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { Badge, Button, Card } from "../components/ui";

const features: { title: string; body: string }[] = [
  {
    title: "Projects & tasks",
    body: "Track status, priority, and ownership across every engagement in one board.",
  },
  {
    title: "Client reporting",
    body: "Share a clean, read-only progress report with clients — no login required on their end.",
  },
  {
    title: "Deliverables & approvals",
    body: "Upload work, route it for client review, and keep a record of what was approved and when.",
  },
  {
    title: "Calendar & talent",
    body: "See every deadline and milestone in one calendar, and staff projects from your bench of available talent.",
  },
];

const sampleTalent: { name: string; title: string; bio: string }[] = [
  {
    name: "Priya Shah",
    title: "Full-stack developer",
    bio: "React, Node, and Postgres. Available for short-term builds and ongoing feature work.",
  },
  {
    name: "Marcus Webb",
    title: "Brand & UI designer",
    bio: "Design systems and landing pages for agencies. Portfolio available on request.",
  },
  {
    name: "Elena Rossi",
    title: "Copywriter",
    bio: "Product marketing and client-facing report copy. Fast turnaround, fluent in EN/IT.",
  },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">P</div>
          <span className="text-lg font-bold text-slate-800 dark:text-slate-100">Portask</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
            Sign in
          </Link>
          <Link to="/register">
            <Button>Get started</Button>
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 text-center sm:pt-20">
          <Badge tone="purple">Agency project tracking</Badge>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
            Project delivery your clients can actually see.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-300">
            Portask keeps projects, deliverables, and client communication in one place — with
            shareable progress reports that don't require your clients to sign in.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/register">
              <Button className="px-6 py-3 text-base">Get started free</Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" className="px-6 py-3 text-base">Sign in</Button>
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <Card key={f.title}>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{f.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="bg-white py-16 dark:bg-slate-900">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                Talent ready to join your next project
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Freelancers on Portask can mark themselves available, so agencies can staff up without leaving the app.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {sampleTalent.map((t) => (
                <Card key={t.name}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                      {initials(t.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{t.name}</span>
                        <Badge tone="green">Available</Badge>
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{t.title}</div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t.bio}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
              Sample profiles shown for illustration. Sign in to see your agency's real talent pool.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Ready to bring your projects into one place?</h2>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link to="/register">
              <Button className="px-6 py-3 text-base">Create your account</Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-400 dark:border-slate-800 dark:text-slate-500">
        © {new Date().getFullYear()} Portask
      </footer>
    </div>
  );
}
