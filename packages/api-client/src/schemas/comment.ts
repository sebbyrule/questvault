import { z } from "zod";

export const createCommentBodySchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(5000),
});

export const updateCommentBodySchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(5000),
});

export type CreateCommentBody = z.infer<typeof createCommentBodySchema>;
export type UpdateCommentBody = z.infer<typeof updateCommentBodySchema>;
