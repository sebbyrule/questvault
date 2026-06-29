"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { completeSprint } from "@/lib/sprint-actions";
import type { SprintAnalytics } from "@/lib/queries";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-teal-50 text-teal-700",
  completed: "bg-brand-50 text-brand-700",
  planned: "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-400",
};

export function SprintAnalyticsView({
  projectName,
  sprints,
  isAdmin,
}: {
  projectName: string;
  sprints: SprintAnalytics[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const completed = sprints.filter((s) => s.status === "completed");
  const active = sprints.filter((s) => s.status === "active");
  const maxDelivered = Math.max(1, ...completed.map((s) => s.delivered));
  const avgVelocity = completed.length
    ? Math.round(completed.reduce((sum, s) => sum + s.delivered, 0) / completed.length)
    : 0;

  function complete(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await completeSprint(id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {projectName} · {completed.length} completed sprint{completed.length === 1 ? "" : "s"}
          {avgVelocity > 0 && ` · avg velocity ${avgVelocity} pts`}
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Active sprint progress */}
      {active.length > 0 && (
        <section className="mb-8 space-y-3">
          {active.map((s) => (
            <div key={s.id} className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">{s.name}</h2>
                  <p className="text-xs text-gray-400">
                    {s.done}/{s.total} tickets · {s.delivered}/{s.committed} pts delivered
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => complete(s.id)}
                    disabled={pending}
                    className="btn-primary"
                  >
                    Complete sprint
                  </button>
                )}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-teal-500 transition-all"
                  style={{ width: `${pct(s.delivered, s.committed)}%` }}
                />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Velocity */}
      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-700">Velocity (delivered points)</h2>
        {completed.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">No completed sprints yet.</p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {completed.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-gray-500">{s.name}</span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-gray-100">
                  <div
                    className="h-full rounded bg-brand-500"
                    style={{ width: `${(s.delivered / maxDelivered) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-medium text-gray-600">
                  {s.delivered}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Per-sprint table */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-700">All sprints</h2>
        </div>
        {sprints.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No sprints yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                <th className="px-6 py-2 font-medium">Sprint</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Tickets</th>
                <th className="px-3 py-2 font-medium">Points</th>
                <th className="px-6 py-2 text-right font-medium">Completion</th>
              </tr>
            </thead>
            <tbody>
              {sprints.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-6 py-2.5 font-medium text-gray-800">{s.name}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={clsx(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        STATUS_STYLE[s.status] ?? "bg-gray-100 text-gray-500"
                      )}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{s.done}/{s.total}</td>
                  <td className="px-3 py-2.5 text-gray-600">{s.delivered}/{s.committed}</td>
                  <td className="px-6 py-2.5 text-right text-gray-600">{pct(s.delivered, s.committed)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
