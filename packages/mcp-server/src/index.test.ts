import { describe, it, expect } from "vitest";
import { createServer } from "./index";
import { allTools, type ToolContext } from "@questvault/tools";
import { hashAgentToken, isToolAllowed } from "@questvault/db";

// Smoke test: the server factory wires the whole tool registry without a DB.
// (createServer only registers tools; ctx.db is touched only when a tool runs.)
const stubCtx = { db: {}, agentId: "test-agent" } as unknown as ToolContext;

describe("createServer", () => {
  it("registers every registry tool without throwing", () => {
    expect(() => createServer(stubCtx)).not.toThrow();
    expect(createServer(stubCtx)).toBeTruthy();
  });

  it("the registry exposes the core ticket tools", () => {
    const names = allTools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["list_tickets", "create_ticket", "close_ticket", "search_tickets"])
    );
    expect(allTools.length).toBeGreaterThanOrEqual(8);
  });

  it("registers only the allowed tools when a scope set is given", () => {
    expect(() => createServer(stubCtx, new Set(["list_tickets", "get_ticket"]))).not.toThrow();
    // An empty allowlist registers nothing (still constructs).
    expect(() => createServer(stubCtx, new Set())).not.toThrow();
  });
});

describe("agent token helpers", () => {
  it("isToolAllowed honours '*' and explicit names", () => {
    expect(isToolAllowed(["*"], "create_ticket")).toBe(true);
    expect(isToolAllowed(["list_tickets"], "list_tickets")).toBe(true);
    expect(isToolAllowed(["list_tickets"], "create_ticket")).toBe(false);
    expect(isToolAllowed([], "list_tickets")).toBe(false);
  });

  it("hashAgentToken is deterministic and not the raw token", () => {
    const raw = "qv_agent_example_readonly";
    expect(hashAgentToken(raw)).toBe(hashAgentToken(raw));
    expect(hashAgentToken(raw)).not.toBe(raw);
    expect(hashAgentToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAgentToken("a")).not.toBe(hashAgentToken("b"));
  });
});
