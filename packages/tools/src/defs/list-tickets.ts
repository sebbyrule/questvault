import { z } from "zod";
import { tickets, ticketStatusEnum, ticketPriorityEnum } from "@questvault/db/schema";
import { and, eq, isNull } from "@questvault/db";
import type { ToolDefinition } from "../types";

const schema = z.object({
  project_id: z.string().uuid(),
  status: z.enum(ticketStatusEnum.enumValues).optional(),
  priority: z.enum(ticketPriorityEnum.enumValues).optional(),
  assignee_id: z.string().uuid().optional(),
  sprint_id: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const listTicketsTool: ToolDefinition = {
  name: "list_tickets",
  description:
    "List tickets in a project with optional filters (status, priority, assignee, sprint). Returns paginated results.",
  inputSchema: schema,
  async execute(raw, { db }) {
    const input = schema.parse(raw);
    const conditions = [eq(tickets.projectId, input.project_id)];

    if (input.status) conditions.push(eq(tickets.status, input.status));
    if (input.priority) conditions.push(eq(tickets.priority, input.priority));
    if (input.assignee_id) conditions.push(eq(tickets.assigneeId, input.assignee_id));
    if (input.sprint_id === null) conditions.push(isNull(tickets.sprintId));
    else if (input.sprint_id) conditions.push(eq(tickets.sprintId, input.sprint_id));

    const rows = await db.query.tickets.findMany({
      where: and(...conditions),
      columns: {
        id: true, number: true, title: true, status: true,
        priority: true, assigneeId: true, storyPoints: true,
        dueDate: true, createdAt: true, updatedAt: true,
        // Never return embeddings to agents — expensive and unnecessary.
        embedding: false,
      },
      limit: input.limit,
      offset: input.offset,
      orderBy: (t, { asc }) => [asc(t.rank)],
    });

    return { tickets: rows, count: rows.length, limit: input.limit, offset: input.offset };
  },
};
