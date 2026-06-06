import type { Metadata } from "next";
import Link from "next/link";
import { getProjectCards } from "@/lib/queries";
import { Card } from "@/components/ui";
import { NewProjectButton } from "@/components/new-project";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getProjectCards();

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </p>
        </div>
        <NewProjectButton />
      </header>

      {projects.length === 0 ? (
        <p className="text-sm text-gray-400">No projects yet — create your first one.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            return (
              <Link key={p.id} href={`/board?project=${p.slug}`}>
                <Card className="h-full p-5 transition hover:border-brand-200 hover:shadow-sm">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
                      style={{ backgroundColor: (p.color ?? "#534AB7") + "1A" }}
                    >
                      {p.iconEmoji ?? "📋"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{p.name}</p>
                      <p className="truncate text-xs text-gray-400">/{p.slug}</p>
                    </div>
                  </div>

                  {p.description && (
                    <p className="mt-3 line-clamp-2 text-sm text-gray-500">{p.description}</p>
                  )}

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{p.done}/{p.total} done</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-teal-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-3 text-xs text-gray-400">
                    <span>{p.members} {p.members === 1 ? "member" : "members"}</span>
                    <span>·</span>
                    <span>{p.total} tickets</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
