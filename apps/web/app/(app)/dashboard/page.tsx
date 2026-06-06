import type { Metadata } from "next";
import {
  getPrimaryProject,
  getStatusCounts,
  getActiveSprint,
  getLeaderboard,
} from "@/lib/queries";
import { Avatar, Card, StatCard } from "@/components/ui";
import {
  BOARD_COLUMNS,
  STATUS_META,
  levelProgress,
  formatDate,
  daysUntil,
} from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const project = await getPrimaryProject();
  const [counts, sprint, leaders] = await Promise.all([
    project ? getStatusCounts(project.id) : Promise.resolve<Record<string, number>>({}),
    project ? getActiveSprint(project.id) : Promise.resolve(null),
    getLeaderboard(),
  ]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const done = counts.done ?? 0;
  const inProgress = counts.in_progress ?? 0;
  const totalXp = leaders.reduce((a, u) => a + u.xpTotal, 0);
  const sprintLeft = daysUntil(sprint?.endDate ?? null);

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {project ? `${project.iconEmoji} ${project.name}` : "No project"} · sprint overview & team progress
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active tickets" value={total} hint={`${done} done`} />
        <StatCard label="In progress" value={inProgress} accent="text-amber-600" />
        <StatCard
          label="Completion"
          value={total ? `${Math.round((done / total) * 100)}%` : "—"}
          accent="text-teal-600"
        />
        <StatCard label="Team XP" value={totalXp.toLocaleString()} accent="text-brand-600" hint="lifetime" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Status breakdown */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700">Tickets by status</h2>
          <div className="mt-4 space-y-3">
            {BOARD_COLUMNS.map((status) => {
              const c = counts[status] ?? 0;
              const pct = total ? (c / total) * 100 : 0;
              const meta = STATUS_META[status];
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-medium text-gray-500">{meta.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs font-semibold text-gray-700">{c}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Active sprint */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-700">Active sprint</h2>
          {sprint ? (
            <div className="mt-4">
              <p className="text-lg font-bold text-gray-900">{sprint.name}</p>
              {sprint.goal && <p className="mt-1 text-sm text-gray-500">{sprint.goal}</p>}
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
                </span>
                {sprintLeft != null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      sprintLeft <= 2 ? "bg-red-50 text-red-600" : "bg-teal-50 text-teal-600"
                    }`}
                  >
                    {sprintLeft > 0 ? `${sprintLeft}d left` : "ended"}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-400">No active sprint.</p>
          )}
        </Card>
      </div>

      {/* Leaderboard */}
      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-700">Leaderboard</h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {leaders.map((u, i) => {
            const { level, pct, toNext } = levelProgress(u.xpTotal);
            return (
              <li key={u.id} className="flex items-center gap-4 px-6 py-4">
                <span className="w-5 text-center text-sm font-bold text-gray-400">{i + 1}</span>
                <Avatar name={u.displayName} url={u.avatarUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-gray-900">{u.displayName}</p>
                    <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-600">
                      Lv {level}
                    </span>
                    {u.streakDays > 0 && (
                      <span className="text-xs text-amber-600">🔥 {u.streakDays}d</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-brand-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-400">{toNext} XP to next</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{u.xpTotal.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">
                    {u.badges} {u.badges === 1 ? "badge" : "badges"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
