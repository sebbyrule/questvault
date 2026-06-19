import type { z } from "zod";
import type { Database } from "@questvault/db";
// Type-only: the EventType union is erased at build, so consumers of `tools`
// (incl. the web bundle) never pull the event bus' ioredis through this import.
import type { EventType } from "@questvault/events";

/**
 * Publish a domain event to the bus. Injected by surfaces that have the event
 * bus (the MCP HTTP server, the coach) — mirroring how `embed` is injected to
 * avoid a tools→ai cycle. When absent, tools simply don't publish.
 */
export type PublishFn = (
  type: EventType,
  payload: Record<string, unknown>,
  actorId: string | null
) => Promise<void>;

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
  /**
   * Optional embedder for semantic search (injected by surfaces that have the
   * AI package, e.g. the coach). Returns null when embeddings are disabled or
   * unavailable — tools that use it must fall back to non-vector behaviour.
   */
  embed?: (text: string) => Promise<number[] | null>;
  /**
   * Optional event-bus publisher (injected by surfaces that have it). Lets
   * agent/coach mutations emit domain events so the worker awards XP and (later)
   * dispatches webhooks. Best-effort: implementations never throw.
   */
  publish?: PublishFn;
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
