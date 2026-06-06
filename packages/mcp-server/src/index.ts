/**
 * QuestVault MCP Server
 *
 * Exposes ticket management tools to MCP-compatible agents (Claude Code, etc.)
 * over HTTP/SSE. Each tool call is validated, executed, and logged to
 * agent_audit_log before returning.
 *
 * Transport: HTTP (Streamable HTTP transport per MCP spec 2025-03-26)
 * Auth:      Bearer token checked against MCP_AGENT_SECRET env var
 *            (extend to per-agent DB tokens in Phase 4)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHash } from "crypto";
import { db } from "@questvault/db";
import { agentAuditLog } from "@questvault/db/schema";
import { listTicketsSchema, listTickets } from "./tools/list-tickets.js";
import { createTicketSchema, createTicket } from "./tools/create-ticket.js";
import { closeTicketSchema, closeTicket } from "./tools/close-ticket.js";

// ─── Server setup ─────────────────────────────────────────────────────────────

export const server = new McpServer({
  name: "questvault",
  version: "0.1.0",
});

// ─── Audit helper ─────────────────────────────────────────────────────────────

async function audit(
  agentId: string,
  toolName: string,
  input: unknown,
  fn: () => Promise<unknown>
): Promise<unknown> {
  const start = Date.now();
  const inputHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");

  let success = true;
  let errorCode: string | undefined;
  let result: unknown;

  try {
    result = await fn();
  } catch (err) {
    success = false;
    errorCode = err instanceof Error ? err.message : "UNKNOWN";
    throw err;
  } finally {
    await db.insert(agentAuditLog).values({
      agentId,
      toolName,
      inputHash,
      outputSummary: success ? "ok" : errorCode,
      durationMs: Date.now() - start,
      success,
      errorCode,
    });
  }

  return result;
}

// ─── Tool: list_tickets ───────────────────────────────────────────────────────

server.tool(
  "list_tickets",
  "List tickets in a project with optional filters.",
  listTicketsSchema.shape,
  async (input) => {
    const agentId = "agent"; // TODO: derive from auth context
    const validated = listTicketsSchema.parse(input);
    const result = await audit(agentId, "list_tickets", validated, () =>
      listTickets(db, validated)
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Tool: create_ticket ──────────────────────────────────────────────────────

server.tool(
  "create_ticket",
  "Create a new ticket in a project.",
  createTicketSchema.shape,
  async (input) => {
    const agentId = "agent";
    const AGENT_REPORTER_ID = process.env.MCP_AGENT_REPORTER_ID ?? "";
    const validated = createTicketSchema.parse(input);
    const result = await audit(agentId, "create_ticket", validated, () =>
      createTicket(db, validated, AGENT_REPORTER_ID)
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Tool: close_ticket ───────────────────────────────────────────────────────

server.tool(
  "close_ticket",
  "Transition a ticket to Done status. Triggers XP award for assignee.",
  closeTicketSchema.shape,
  async (input) => {
    const agentId = "agent";
    const validated = closeTicketSchema.parse(input);
    const result = await audit(agentId, "close_ticket", validated, () =>
      closeTicket(db, validated, agentId)
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);
