import { z } from "zod";
import {
  tickets,
  ticketHistory,
  ticketStatusEnum,
  ticketPriorityEnum,
} from "@questvault/db/schema";
import { eq, dispatchWebhooks } from "@questvault/db";
import type { ToolDefinition } from "../types";

const schema = z.object({
  ticket_id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(ticketStatusEnum.enumValues).optional(),
  priority: z.enum(ticketPriorityEnum.enumValues).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  sprint_id: z.string().uuid().nullable().optional(),
  story_points: z.number().int().min(1).max(21).nullable().optional(),
  due_date: z.string().datetime().nullable().optional(),
  pr_url: z.string().url().nullable().optional(),
});

type FieldChange = { field: string; oldValue: string | null; newValue: string | null };
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export const updateTicketTool: ToolDefinition = {
  name: "update_ticket",
  description:
    "Partially update a ticket's fields (title, description, status, priority, assignee_id, sprint_id, story_points, due_date, pr_url). Records one change-history entry per modified field.",
  inputSchema: schema,
  async execute(raw, { db, agentId }) {
    const input = schema.parse(raw);

    const current = await db.query.tickets.findFirst({
      where: eq(tickets.id, input.ticket_id),
      columns: { embedding: false },
    });
    if (!current) throw new Error(`Ticket ${input.ticket_id} not found`);

    const set: Partial<typeof tickets.$inferInsert> = {};
    const changes: FieldChange[] = [];
    const track = (field: string, oldV: unknown, newV: unknown) =>
      changes.push({ field, oldValue: str(oldV), newValue: str(newV) });

    if (input.title !== undefined && input.title !== current.title) {
      set.title = input.title;
      track("title", current.title, input.title);
    }
    if (input.description !== undefined && (input.description ?? null) !== (current.description ?? null)) {
      set.description = input.description ?? null;
      track("description", current.description, input.description ?? null);
    }
    if (input.status !== undefined && input.status !== current.status) {
      set.status = input.status;
      if (input.status === "done") set.closedAt = new Date();
      else if (current.status === "done") set.closedAt = null;
      track("status", current.status, input.status);
    }
    if (input.priority !== undefined && input.priority !== current.priority) {
      set.priority = input.priority;
      track("priority", current.priority, input.priority);
    }
    if (input.assignee_id !== undefined && (input.assignee_id ?? null) !== (current.assigneeId ?? null)) {
      set.assigneeId = input.assignee_id ?? null;
      track("assignee", current.assigneeId, input.assignee_id ?? null);
    }
    if (input.sprint_id !== undefined && (input.sprint_id ?? null) !== (current.sprintId ?? null)) {
      set.sprintId = input.sprint_id ?? null;
      track("sprint", current.sprintId, input.sprint_id ?? null);
    }
    if (input.story_points !== undefined && (input.story_points ?? null) !== (current.storyPoints ?? null)) {
      set.storyPoints = input.story_points ?? null;
      track("story_points", current.storyPoints, input.story_points ?? null);
    }
    if (input.due_date !== undefined) {
      const newDue = input.due_date ? new Date(input.due_date) : null;
      if ((newDue?.getTime() ?? null) !== (current.dueDate?.getTime() ?? null)) {
        set.dueDate = newDue;
        track("due_date", current.dueDate?.toISOString() ?? null, newDue?.toISOString() ?? null);
      }
    }
    if (input.pr_url !== undefined && (input.pr_url ?? null) !== (current.prUrl ?? null)) {
      set.prUrl = input.pr_url ?? null;
      track("pr_url", current.prUrl, input.pr_url ?? null);
    }

    if (changes.length === 0) {
      return { ticketId: input.ticket_id, updated: false, changes: [] };
    }
    set.updatedAt = new Date();

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(tickets)
        .set(set)
        .where(eq(tickets.id, input.ticket_id))
        .returning();
      await tx.insert(ticketHistory).values(
        changes.map((c) => ({
          ticketId: input.ticket_id,
          actorId: null,
          agentId,
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
        }))
      );
      return row;
    });

    if (updated) {
      const data = {
        id: updated.id, number: updated.number, title: updated.title,
        projectId: updated.projectId, status: updated.status, priority: updated.priority,
      };
      await dispatchWebhooks(db, { type: "ticket.updated", data });
      if (updated.status === "done" && current.status !== "done") {
        await dispatchWebhooks(db, { type: "ticket.closed", data });
      }
    }

    return { ticketId: input.ticket_id, updated: true, changes, ticket: updated };
  },
};
