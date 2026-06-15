/**
 * AI Coach — answers questions grounded in the user's work AND can take action by
 * calling the shared @questvault/tools registry (list/get/create/update/close
 * tickets, comment, list sprints). Streams reasoning/text deltas plus tool
 * activity via AsyncIterable. Uses the provider-agnostic tool-calling loop.
 *
 * Coach-initiated writes are attributed to the QuestVault Agent system user
 * (agentId "coach", reporter = MCP_AGENT_REPORTER_ID).
 */

import {
  streamChatWithTools,
  resolveLlmConfig,
  type ChatMessage,
  type StreamChunk,
} from "./client.js";
import { toToolSpecs } from "./tool-schema.js";
import { getAppSettings, embed, type Database } from "@questvault/db";
import { allTools, toolsByName, type ToolContext } from "@questvault/tools";
import { buildCoachContext } from "./context.js";

const SYSTEM_PROMPT = `You are the QuestVault AI Coach — a pragmatic, direct assistant embedded inside a project management tool.

You have access to the user's current tickets, sprint status, and work context (provided below), plus tools to read fresh data and take actions on their behalf.

Your job is to help the user:
- Prioritise and unblock their work
- Identify risks in the current sprint
- Break large tickets into actionable subtasks (create them with the create_ticket tool when asked)
- Read, update, comment on, and close tickets when the user asks you to

Rules:
- Use tools to act when the user requests a change (e.g. "create a ticket", "close QV-4", "assign this to me"). Prefer tools over guessing or describing what you would do.
- Use tools to fetch details you don't already have (e.g. get_ticket before editing a specific ticket).
- After acting, briefly confirm what you did, referencing ticket numbers (QV-N).
- Be concise. Most answers should be 2-4 sentences unless the user asks for more.
- Never invent ticket information not present in the context or returned by a tool.
- If you don't have enough context to act confidently, ask a clarifying question instead.`;

export async function* streamCoachResponse(
  db: Database,
  projectId: string,
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  sprintId?: string
): AsyncIterable<StreamChunk> {
  const [context, settings] = await Promise.all([
    buildCoachContext(db, projectId, sprintId),
    getAppSettings(db),
  ]);

  // Tool allowlist: null = all tools. Applies to the coach only (external MCP
  // agents are governed by their token).
  const allowed = settings.enabledTools;
  const tools = allowed ? allTools.filter((t) => allowed.includes(t.name)) : allTools;
  const allowedNames = new Set(tools.map((t) => t.name));

  const skills = settings.skillsMd?.trim();
  const systemWithContext = `${SYSTEM_PROMPT}

The current project_id is ${projectId}. Pass it as project_id when calling tools that need one (e.g. list_tickets, create_ticket, list_sprints).
${skills ? `\n--- WORKSPACE SKILLS ---\n${skills}\n` : ""}
--- CURRENT WORK CONTEXT ---
${context}
---`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemWithContext },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const ctx: ToolContext = {
    db,
    agentId: "coach",
    reporterId:
      process.env.MCP_AGENT_REPORTER_ID ?? "00000000-0000-0000-0000-000000000000",
    // Lets the coach's search_tickets do semantic search (no-op when disabled).
    embed,
  };

  const execute = async (name: string, args: unknown): Promise<unknown> => {
    if (!allowedNames.has(name)) throw new Error(`Tool not allowed: ${name}`);
    const tool = toolsByName[name];
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(args, ctx);
  };

  yield* streamChatWithTools(messages, toToolSpecs(tools), execute, {
    maxTokens: 2048,
    temperature: 0.7,
    config: resolveLlmConfig(settings),
  });
}
