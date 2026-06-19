import { z } from "zod";
import { tickets, comments } from "@questvault/db/schema";
import { eq, dispatchWebhooks } from "@questvault/db";
import type { ToolDefinition } from "../types";

const schema = z.object({
  ticket_id: z.string().uuid(),
  resolution_note: z.string().optional(),
});

export const closeTicketTool: ToolDefinition = {
  name: "close_ticket",
  description:
    "Transition a ticket to Done status. Accepts an optional resolution_note, recorded as an agent-authored comment.",
  inputSchema: schema,
  async execute(raw, { db, agentId, reporterId, publish }) {
    const input = schema.parse(raw);

    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, input.ticket_id),
      columns: {
        id: true, number: true, title: true, status: true, projectId: true,
        priority: true, assigneeId: true, createdAt: true,
      },
    });
    if (!ticket) throw new Error(`Ticket ${input.ticket_id} not found`);
    if (ticket.status === "done" || ticket.status === "archived") {
      throw new Error(`Ticket is already ${ticket.status}`);
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(tickets)
        .set({ status: "done", closedAt: now, updatedAt: now })
        .where(eq(tickets.id, input.ticket_id));

      if (input.resolution_note) {
        await tx.insert(comments).values({
          ticketId: input.ticket_id,
          agentId,
          body: `**Resolution:** ${input.resolution_note}`,
        });
      }
    });

    await dispatchWebhooks(db, {
      type: "ticket.closed",
      data: { id: input.ticket_id, projectId: ticket.projectId, status: "done" },
    });

    // Emit a domain event so the worker awards XP (credits the assignee, else
    // the acting agent).
    await publish?.(
      "ticket.closed",
      {
        id: input.ticket_id, number: ticket.number, title: ticket.title,
        projectId: ticket.projectId, priority: ticket.priority,
        assigneeId: ticket.assigneeId,
        openedAt: ticket.createdAt.toISOString(), closedAt: now.toISOString(),
      },
      reporterId
    );

    return { ticketId: input.ticket_id, status: "done", closedAt: now.toISOString() };
  },
};
