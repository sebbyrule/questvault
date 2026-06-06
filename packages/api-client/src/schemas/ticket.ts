import { z } from "zod";

export const ticketStatusSchema = z.enum([
  "backlog", "todo", "in_progress", "in_review", "done", "archived",
]);

export const ticketPrioritySchema = z.enum(["p0", "p1", "p2", "p3"]);

export const createTicketBodySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  priority: ticketPrioritySchema.default("p2"),
  assigneeId: z.string().uuid().optional(),
  sprintId: z.string().uuid().optional(),
  storyPoints: z.number().int().min(1).max(21).optional(),
  parentId: z.string().uuid().optional(),
  labels: z.array(z.string().uuid()).optional(),
});

export const updateTicketBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  storyPoints: z.number().int().min(1).max(21).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  prUrl: z.string().url().nullable().optional(),
  rank: z.string().optional(),
});

export type CreateTicketBody = z.infer<typeof createTicketBodySchema>;
export type UpdateTicketBody = z.infer<typeof updateTicketBodySchema>;
