/**
 * Sprint analytics — velocity, completion, and per-sprint breakdown for the
 * primary project. Read-only for everyone; admins can mark the active sprint
 * complete (which awards sprint_completed XP to contributors via the worker).
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPrimaryProject, getSprintAnalytics, getSessionAccount } from "@/lib/queries";
import { isAdminRole } from "@/lib/roles";
import { SprintAnalyticsView } from "@/components/analytics/sprint-analytics-view";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const project = await getPrimaryProject();
  if (!project) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-2 text-sm text-gray-500">No project yet. Create one to see sprint analytics.</p>
      </div>
    );
  }

  const [sprints, account] = await Promise.all([
    getSprintAnalytics(project.id),
    getSessionAccount(),
  ]);

  return (
    <SprintAnalyticsView
      projectName={project.name}
      sprints={sprints}
      isAdmin={isAdminRole(account?.role)}
    />
  );
}
