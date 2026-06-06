/**
 * AI Coach — answers user questions grounded in their actual work context.
 * Streams back text deltas via AsyncIterable.
 * Uses the provider-agnostic client (LM Studio locally, Anthropic in prod).
 */

import { streamChat, type ChatMessage, type StreamChunk } from "./client.js";
import type { Database } from "@questvault/db";
import { buildCoachContext } from "./context.js";

const SYSTEM_PROMPT = `You are the QuestVault AI Coach — a pragmatic, direct assistant embedded inside a project management tool.

You have access to the user's current tickets, sprint status, and work context (provided below).
Your job is to help the user:
- Prioritise and unblock their work
- Identify risks in the current sprint
- Break large tickets into actionable subtasks
- Give concise, grounded advice (not generic productivity tips)

Rules:
- Be brief. Most answers should be 2-4 sentences unless the user asks for more.
- Reference specific ticket numbers (QV-N) when relevant.
- Never make up ticket information not present in the context.
- If you don't have enough context to answer confidently, say so and ask a clarifying question.`;

export async function* streamCoachResponse(
  db: Database,
  projectId: string,
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  sprintId?: string
): AsyncIterable<StreamChunk> {
  const context = await buildCoachContext(db, projectId, sprintId);

  const systemWithContext = `${SYSTEM_PROMPT}

--- CURRENT WORK CONTEXT ---
${context}
---`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemWithContext },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  // Reasoning models spend tokens thinking before the answer — give headroom.
  yield* streamChat(messages, { maxTokens: 2048, temperature: 0.7 });
}
