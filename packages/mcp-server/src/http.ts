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
import { db } from "@questvault/db";
import type { ToolContext } from "@questvault/tools";
import { createServer } from "./index.js";

const PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : 3003;

function bearerOk(header: string | undefined): boolean {
  const secret = process.env.MCP_AGENT_SECRET ?? "";
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// ─── Health (no auth) ──────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", transport: "streamable-http", endpoint: "/mcp" });
});

// ─── MCP endpoint ───────────────────────────────────────────────────────────────
app.post("/mcp", async (req, res) => {
  if (!bearerOk(req.headers.authorization)) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    return;
  }

  const ctx: ToolContext = {
    db,
    // Optional X-Agent-Id label for the audit log; defaults to a generic id.
    agentId:
      (typeof req.headers["x-agent-id"] === "string"
        ? req.headers["x-agent-id"]
        : undefined) || "mcp-agent",
    reporterId:
      process.env.MCP_AGENT_REPORTER_ID ??
      "00000000-0000-0000-0000-000000000000",
  };

  // Stateless: a fresh server + transport per request (no session reuse).
  const server = createServer(ctx);
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
