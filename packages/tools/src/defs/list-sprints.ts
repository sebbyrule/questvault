import { z } from "zod";
import { sprints, tickets } from "@questvault/db/schema";
import { eq, sql, desc } from "@questvault/db";
import type { ToolDefinition } from "../types";

const schema = z.object({
  project_id: z.string().uuid(),
});

export const listSprintsTool: ToolDefinition = {
  name: "list_sprints",
  description:
    "List sprints for a project with completion stats (ticket counts and story-point sums, total vs done).",
  inputSchema: schema,
  async execute(raw, { db }) {
    const input = schema.parse(raw);

    const sprintRows = await db
      .select()
      .from(sprints)
      .where(eq(sprints.projectId, input.project_id))
      .orderBy(desc(sprints.createdAt));

    // Per-sprint ticket aggregates in one grouped query.
    const aggRows = await db
      .select({
        sprintId: tickets.sprintId,
        totalTickets: sql<number>`count(*)::int`,
        doneTickets: sql<number>`count(*) filter (where ${tickets.status} = 'done')::int`,
        totalPoints: sql<number>`coalesce(sum(${tickets.storyPoints}), 0)::int`,
        donePoints: sql<number>`coalesce(sum(${tickets.storyPoints}) filter (where ${tickets.status} = 'done'), 0)::int`,
      })
      .from(tickets)
      .where(eq(tickets.projectId, input.project_id))
      .groupBy(tickets.sprintId);

    const statsBySprint = new Map(aggRows.map((r) => [r.sprintId, r]));
    const empty = { totalTickets: 0, doneTickets: 0, totalPoints: 0, donePoints: 0 };

    const sprintsWithStats = sprintRows.map((s) => {
      const a = statsBySprint.get(s.id) ?? empty;
      const completionRate =
        a.totalPoints > 0 ? Math.round((a.donePoints / a.totalPoints) * 100) : 0;
      return {
        ...s,
        stats: {
          totalTickets: a.totalTickets,
          doneTickets: a.doneTickets,
          totalPoints: a.totalPoints,
          donePoints: a.donePoints,
          completionRate,
        },
      };
    });

    return { sprints: sprintsWithStats, count: sprintsWithStats.length };
  },
};
