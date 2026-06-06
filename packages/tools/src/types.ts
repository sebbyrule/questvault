import type { z } from "zod";
import type { Database } from "@questvault/db";

/**
 * Execution context passed to every tool. Both surfaces (the MCP server for
 * external agents, and the in-app AI coach) build one of these and hand it to
 * `execute`.
 *
 * - `db`         — the database handle.
 * - `agentId`    — text identifier of the caller, recorded on agent-authored
 *                  comments / history and in the audit log (e.g. "mcp-agent",
 *                  "claude-code", or "coach:<userId>").
 * - `reporterId` — a real `users.id` (UUID) used as the reporter/author FK when a
 *                  tool must create a row that requires a non-null user.
 */
export interface ToolContext {
  db: Database;
  agentId: string;
  reporterId: string;
}

/**
 * A single tool, usable from any surface. `execute` receives the raw, unvalidated
 * input and is responsible for parsing it with `inputSchema` (so callers can pass
 * arguments straight through). Results are plain JSON-serialisable values.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.AnyZodObject;
  execute(input: unknown, ctx: ToolContext): Promise<unknown>;
}
