"use server";

/**
 * Sprint lifecycle actions. completeSprint marks a sprint done and emits a
 * `sprint.completed` event; the worker fans out sprint_completed XP to each
 * contributor (assignees of delivered tickets). Admin-gated.
 */
import { db, eq } from "@questvault/db";
import { sprints, tickets } from "@questvault/db/schema";
import { publishEvent } from "@questvault/events";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./authz";

export async function completeSprint(sprintId: string) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "Forbidden" };

  const sprint = await db.query.sprints.findFirst({
    where: eq(sprints.id, sprintId),
    columns: { id: true, status: true, projectId: true },
  });
  if (!sprint) return { ok: false as const, error: "Sprint not found" };
  if (sprint.status === "completed") {
    return { ok: false as const, error: "Sprint is already completed" };
  }

  // Tally committed vs delivered points + the contributors who delivered.
  const rows = await db
    .select({ status: tickets.status, points: tickets.storyPoints, assignee: tickets.assigneeId })
    .from(tickets)
    .where(eq(tickets.sprintId, sprintId));

  let committedPoints = 0;
  let deliveredPoints = 0;
  const contributors = new Set<string>();
  for (const r of rows) {
    const p = r.points ?? 0;
    committedPoints += p;
    if (r.status === "done") {
      deliveredPoints += p;
      if (r.assignee) contributors.add(r.assignee);
    }
  }

  const now = new Date();
  await db
    .update(sprints)
    .set({ status: "completed", completedAt: now, updatedAt: now })
    .where(eq(sprints.id, sprintId));

  // The worker awards sprint_completed XP to each contributor (idempotent).
  await publishEvent(
    "sprint.completed",
    {
      sprintId,
      projectId: sprint.projectId,
      committedPoints,
      deliveredPoints,
      contributorIds: Array.from(contributors),
    },
    admin.id
  );

  revalidatePath("/analytics");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
