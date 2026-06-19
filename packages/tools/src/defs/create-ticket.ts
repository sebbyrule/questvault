import { z } from "zod";
import { tickets, ticketLabels, ticketPriorityEnum } from "@questvault/db/schema";
import { eq, max, dispatchWebhooks } from "@questvault/db";
import type { ToolDefinition } from "../types";

const schema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  priority: z.enum(ticketPriorityEnum.enumValues).default("p2"),
  assignee_id: z.string().uuid().optional(),
  sprint_id: z.string().uuid().optional(),
  story_points: z.number().int().min(1).max(21).optional(),
  labels: z.array(z.string().uuid()).optional(),
  parent_id: z.string().uuid().optional(),
});

export const createTicketTool: ToolDefinition = {
  name: "create_ticket",
  description:
    "Create a new ticket in a project. Required: project_id, title. Optional: description, priority, assignee_id, sprint_id, story_points, labels, parent_id.",
  inputSchema: schema,
  async execute(raw, { db, reporterId, publish }) {
    const input = schema.parse(raw);

    // Auto-increment the per-project ticket number.
    const [maxRow] = await db
      .select({ maxNumber: max(tickets.number) })
      .from(tickets)
      .where(eq(tickets.projectId, input.project_id));
    const nextNumber = (maxRow?.maxNumber ?? 0) + 1;

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(tickets)
        .values({
          number: nextNumber,
          projectId: input.project_id,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority,
          assigneeId: input.assignee_id ?? null,
          sprintId: input.sprint_id ?? null,
          storyPoints: input.story_points ?? null,
          parentId: input.parent_id ?? null,
          reporterId,
        })
        .returning();
      if (!row) throw new Error("Failed to insert ticket");

      if (input.labels && input.labels.length > 0) {
        await tx
          .insert(ticketLabels)
          .values(input.labels.map((labelId) => ({ ticketId: row.id, labelId })));
      }
      return row;
    });

    await dispatchWebhooks(db, {
      type: "ticket.created",
      data: {
        id: created.id, number: created.number, title: created.title,
        projectId: created.projectId, status: created.status, priority: created.priority,
      },
    });

    // Emit a domain event so the worker awards XP (reporter = the agent).
    await publish?.(
      "ticket.created",
      {
        id: created.id, number: created.number, title: created.title,
        description: created.description, projectId: created.projectId,
        status: created.status, priority: created.priority,
        reporterId, assigneeId: created.assigneeId,
      },
      reporterId
    );

    return created;
  },
};
