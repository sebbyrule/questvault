import { z } from "zod";
import { tickets, ticketLabels, labels } from "@questvault/db/schema";
import { eq } from "@questvault/db";
import type { ToolDefinition } from "../types.js";

const schema = z.object({
  ticket_id: z.string().uuid(),
});

const person = { id: true, displayName: true, avatarUrl: true } as const;

export const getTicketTool: ToolDefinition = {
  name: "get_ticket",
  description:
    "Get full detail for a ticket: properties, assignee/reporter/sprint, labels, comments, change history, and linked PR.",
  inputSchema: schema,
  async execute(raw, { db }) {
    const input = schema.parse(raw);

    const row = await db.query.tickets.findFirst({
      where: eq(tickets.id, input.ticket_id),
      columns: { embedding: false },
      with: {
        project: { columns: { id: true, name: true, slug: true } },
        assignee: { columns: person },
        reporter: { columns: person },
        sprint: { columns: { id: true, name: true, status: true } },
        comments: {
          with: { author: { columns: person } },
          orderBy: (c, { asc }) => [asc(c.createdAt)],
        },
        history: {
          with: { actor: { columns: person } },
          orderBy: (h, { desc }) => [desc(h.createdAt)],
        },
      },
    });
    if (!row) throw new Error(`Ticket ${input.ticket_id} not found`);

    const ticketLabelRows = await db
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(ticketLabels)
      .innerJoin(labels, eq(ticketLabels.labelId, labels.id))
      .where(eq(ticketLabels.ticketId, input.ticket_id));

    return { ...row, labels: ticketLabelRows };
  },
};
