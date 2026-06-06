/**
 * Context builder for the AI coach.
 * Assembles the minimal, most-relevant ticket context for each LLM call.
 * Keeps token budget tight to control inference costs.
 */

import type { Database } from "@questvault/db";
import { tickets, sprints } from "@questvault/db/schema";
import { eq, and, inArray } from "@questvault/db";

const MAX_TICKETS_IN_CONTEXT = 15;
const MAX_DESCRIPTION_CHARS   = 300;

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max) + "…";
}

export async function buildCoachContext(
  db: Database,
  projectId: string,
  sprintId?: string
): Promise<string> {
  // Fetch active sprint info
  let sprintInfo = "";
  if (sprintId) {
    const sprint = await db.query.sprints.findFirst({
      where: eq(sprints.id, sprintId),
    });
    if (sprint) {
      sprintInfo = `Current sprint: "${sprint.name}" (${sprint.status})`;
      if (sprint.goal) sprintInfo += `\nGoal: ${sprint.goal}`;
      if (sprint.endDate) {
        const daysLeft = Math.ceil(
          (new Date(sprint.endDate).getTime() - Date.now()) / 86_400_000
        );
        sprintInfo += `\nDays remaining: ${daysLeft}`;
      }
    }
  }

  // Fetch open tickets for this sprint (or project-level backlog)
  const openTickets = await db.query.tickets.findMany({
    where: and(
      eq(tickets.projectId, projectId),
      inArray(tickets.status, ["todo", "in_progress", "in_review", "backlog"]),
      ...(sprintId ? [eq(tickets.sprintId, sprintId)] : [])
    ),
    columns: {
      id: true, number: true, title: true, status: true,
      priority: true, description: true, storyPoints: true,
    },
    limit: MAX_TICKETS_IN_CONTEXT,
    orderBy: (t, { asc }) => [asc(t.priority), asc(t.rank)],
  });

  const ticketLines = openTickets.map((t) =>
    `- [QV-${t.number}] (${t.priority.toUpperCase()}) ${t.status}: ${t.title}` +
    (t.description ? `\n  ${truncate(t.description, MAX_DESCRIPTION_CHARS)}` : "")
  );

  return [
    sprintInfo,
    sprintInfo ? "" : "",
    `Open tickets (${openTickets.length}):`,
    ...ticketLines,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}
