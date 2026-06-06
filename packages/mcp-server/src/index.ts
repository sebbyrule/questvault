/**
 * QuestVault MCP Server
 *
 * Exposes the shared @questvault/tools registry to MCP-compatible agents
 * (Claude Code, Hermes, etc.) over HTTP. Each tool call is validated by the
 * tool's Zod schema, executed, and logged to agent_audit_log.
 *
 * This module builds the McpServer; the HTTP transport lives in http.ts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHash } from "node:crypto";
import { agentAuditLog } from "@questvault/db/schema";
import { allTools, type ToolContext } from "@questvault/tools";

// ─── Audit helper ─────────────────────────────────────────────────────────────

async function audit(
  ctx: ToolContext,
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
  try {
    return await fn();
  } catch (err) {
    success = false;
    errorCode = err instanceof Error ? err.message : "UNKNOWN";
    throw err;
  } finally {
    await ctx.db.insert(agentAuditLog).values({
      agentId: ctx.agentId,
      toolName,
      inputHash,
      outputSummary: success ? "ok" : errorCode ?? null,
      durationMs: Date.now() - start,
      success,
      errorCode: errorCode ?? null,
    });
  }
}

// ─── Server factory ────────────────────────────────────────────────────────────

/**
 * Build an McpServer with every registry tool registered for the given context.
 * In stateless HTTP serving a fresh server is created per request.
 */
export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "questvault", version: "0.1.0" });

  for (const tool of allTools) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema.shape,
      async (args: unknown) => {
        const result = await audit(ctx, tool.name, args, () =>
          tool.execute(args, ctx)
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      }
    );
  }

  return server;
}
