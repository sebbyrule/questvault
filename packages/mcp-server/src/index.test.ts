import { describe, it, expect } from "vitest";
import { createServer } from "./index";
import { allTools, type ToolContext } from "@questvault/tools";

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
    expect(names).toEqual(expect.arrayContaining(["list_tickets", "create_ticket", "close_ticket"]));
    expect(allTools.length).toBeGreaterThanOrEqual(7);
  });
});
