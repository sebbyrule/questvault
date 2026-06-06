import { Router } from "express";
import { db } from "@questvault/db";
import { streamCoachResponse } from "@questvault/ai";
import { z } from "zod";

export const aiRouter = Router();

const chatBodySchema = z.object({
  projectId: z.string().uuid(),
  message: z.string().min(1).max(2000),
  sprintId: z.string().uuid().optional(),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ).optional().default([]),
});

// POST /api/v1/ai/chat  — streams SSE response
aiRouter.post("/chat", async (req, res, next) => {
  try {
    const body = chatBodySchema.parse(req.body);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const stream = streamCoachResponse(
      db,
      body.projectId,
      body.message,
      body.history,
      body.sprintId
    );

    for await (const chunk of stream) {
      res.write(
        `data: ${JSON.stringify({ type: chunk.kind, delta: chunk.text })}\n\n`
      );
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    next(err);
  }
});
