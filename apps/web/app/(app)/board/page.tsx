import type { Metadata } from "next";
import {
  getPrimaryProject,
  getProjectBySlug,
  getProjectOptions,
  getBoardTickets,
} from "@/lib/queries";
import { BOARD_COLUMNS, STATUS_META } from "@/lib/format";
import { TicketCard } from "@/components/ticket-card";
import { NewTicketButton } from "@/components/new-ticket";
import { ProjectSwitcher } from "@/components/project-switcher";

export const metadata: Metadata = { title: "Board" };
export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  // Resolve the selected project from ?project=<slug>, falling back to the
  // primary (first) project when absent or unknown.
  const selected = searchParams.project
    ? await getProjectBySlug(searchParams.project)
    : null;
  const project = selected ?? (await getPrimaryProject());
  if (!project) {
    return <EmptyState />;
  }

  const [tickets, projectOptions] = await Promise.all([
    getBoardTickets(project.id),
    getProjectOptions(),
  ]);
  const byStatus = (status: string) => tickets.filter((t) => t.status === status);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-8 py-5">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span>{project.iconEmoji}</span> {project.name} board
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {tickets.length} active {tickets.length === 1 ? "ticket" : "tickets"} · hover a card to move it
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ProjectSwitcher projects={projectOptions} currentSlug={project.slug} />
          <NewTicketButton projectId={project.id} />
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex min-w-max gap-4">
          {BOARD_COLUMNS.map((status) => {
            const items = byStatus(status);
            const meta = STATUS_META[status];
            return (
              <section key={status} className="flex w-72 flex-col rounded-2xl bg-gray-100/70">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                    <h2 className="text-sm font-semibold text-gray-700">{meta.label}</h2>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-500">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 px-2 pb-3">
                  {items.map((t) => (
                    <TicketCard key={t.id} ticket={t} />
                  ))}
                  {items.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-gray-400">No tickets</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-semibold text-gray-900">No project found</p>
        <p className="mt-1 text-sm text-gray-500">
          Run <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">pnpm db:seed</code> to load dev data.
        </p>
      </div>
    </div>
  );
}
