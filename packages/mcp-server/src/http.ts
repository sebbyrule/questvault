/**
 * QuestVault MCP HTTP server — port 3003.
 *
 * Serves the shared tool registry to external MCP agents over the Streamable
 * HTTP transport (stateless: a fresh server + transport per request). Auth is a
 * bearer token checked against MCP_AGENT_SECRET (per-agent scoped tokens later).
 *
 *   POST /mcp     — MCP endpoint (requires `Authorization: Bearer <secret>`)
 *   GET  /health  — liveness probe (no auth)
 */
import "./load-env.js"; // must run before any import that reads env (@questvault/db)
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { db, resolveAgentToken, embed } from "@questvault/db";
import type { ToolContext } from "@questvault/tools";
import { createServer } from "./index.js";

const PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : 3003;
const AGENT_USER_ID =
  process.env.MCP_AGENT_REPORTER_ID ?? "00000000-0000-0000-0000-000000000000";

type Principal = { agentId: string; reporterId: string; scopes: string[] };

function legacySecretMatch(token: string): boolean {
  const secret = process.env.MCP_AGENT_SECRET ?? "";
  if (!secret) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Resolve a bearer token to a principal: a real scoped agent_token first, then
 * the legacy shared secret (all scopes, agent-user reporter), else null.
 */
async function authenticate(header: string | undefined): Promise<Principal | null> {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);

  const agent = await resolveAgentToken(db, token);
  if (agent) {
    return { agentId: agent.name, reporterId: agent.reporterId, scopes: agent.scopes };
  }
  if (legacySecretMatch(token)) {
    return { agentId: "mcp-agent", reporterId: AGENT_USER_ID, scopes: ["*"] };
  }
  return null;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// ─── Health (no auth) ──────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", transport: "streamable-http", endpoint: "/mcp" });
});

// ─── MCP endpoint ───────────────────────────────────────────────────────────────
app.post("/mcp", async (req, res) => {
  const principal = await authenticate(req.headers.authorization);
  if (!principal) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    return;
  }

  const ctx: ToolContext = {
    db,
    agentId: principal.agentId,
    reporterId: principal.reporterId,
    embed, // lets search_tickets do semantic search (no-op when disabled)
  };

  // Per-agent scopes: "*" registers all tools, else only the named ones.
  const allowed = principal.scopes.includes("*")
    ? undefined
    : new Set(principal.scopes);

  // Stateless: a fresh server + transport per request (no session reuse).
  const server = createServer(ctx, allowed);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp] request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`QuestVault MCP  →  http://localhost:${PORT}/mcp`);
  console.log(`Health check    →  http://localhost:${PORT}/health`);
});
