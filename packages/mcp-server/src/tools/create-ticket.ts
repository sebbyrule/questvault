import { z } from "zod";
import type { Database } from "@questvault/db";
import { tickets, ticketPriorityEnum } from "@questvault/db/schema";
import { eq, max } from "@questvault/db";

export const createTicketSchema = z.object({
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

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export async function createTicket(
  db: Database,
  input: CreateTicketInput,
  reporterId: string  // The agent's service account ID
) {
  // Auto-increment ticket number within the project
  const [maxRow] = await db
    .select({ maxNumber: max(tickets.number) })
    .from(tickets)
    .where(eq(tickets.projectId, input.project_id));

  const nextNumber = (maxRow?.maxNumber ?? 0) + 1;

  const [created] = await db
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

  if (!created) throw new Error("Failed to insert ticket");
  return created;
}
