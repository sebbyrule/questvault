import { z } from "zod";
import type { Database } from "@questvault/db";
import { tickets, comments } from "@questvault/db/schema";
import { eq } from "@questvault/db";

export const closeTicketSchema = z.object({
  ticket_id: z.string().uuid(),
  resolution_note: z.string().optional(),
});

export type CloseTicketInput = z.infer<typeof closeTicketSchema>;

export async function closeTicket(
  db: Database,
  input: CloseTicketInput,
  agentId: string
) {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, input.ticket_id),
    columns: { id: true, status: true, projectId: true },
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

  return { ticketId: input.ticket_id, closedAt: now.toISOString() };
}
