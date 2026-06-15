import { z } from "zod";
import { tickets, comments } from "@questvault/db/schema";
import { eq, dispatchWebhooks } from "@questvault/db";
import type { ToolDefinition } from "../types";

const schema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().min(1).max(5000),
});

export const addCommentTool: ToolDefinition = {
  name: "add_comment",
  description:
    "Add a comment to a ticket. Attributed to the calling agent (recorded with the agent's identity).",
  inputSchema: schema,
  async execute(raw, { db, agentId }) {
    const input = schema.parse(raw);

    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, input.ticket_id),
      columns: { id: true },
    });
    if (!ticket) throw new Error(`Ticket ${input.ticket_id} not found`);

    const [created] = await db
      .insert(comments)
      .values({ ticketId: input.ticket_id, agentId, body: input.body })
      .returning();

    await dispatchWebhooks(db, {
      type: "comment.created",
      data: { id: created?.id, ticketId: input.ticket_id, agentId, body: input.body },
    });

    return created;
  },
};
