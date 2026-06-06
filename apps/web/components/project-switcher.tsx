"use client";

// Project switcher for the board header. Selecting a project navigates to
// /board?project=<slug>, which re-renders the board for that project.
import { useRouter } from "next/navigation";
import type { ProjectOption } from "@/lib/queries";

export function ProjectSwitcher({
  projects,
  currentSlug,
}: {
  projects: ProjectOption[];
  currentSlug: string;
}) {
  const router = useRouter();

  // With only one project there's nothing to switch between.
  if (projects.length <= 1) return null;

  return (
    <label className="flex items-center gap-2 text-sm text-gray-500">
      <span className="hidden sm:inline">Project</span>
      <select
        value={currentSlug}
        onChange={(e) => router.push(`/board?project=${e.target.value}`)}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium text-gray-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.slug}>
            {p.iconEmoji ? `${p.iconEmoji}  ` : ""}
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
