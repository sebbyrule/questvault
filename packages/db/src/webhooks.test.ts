import { describe, it, expect } from "vitest";
// Import directly (not the package index) to stay DB-free.
import { signPayload, isEventSubscribed, backoffMs } from "./webhooks";

describe("signPayload", () => {
  it("is a deterministic HMAC-SHA256 hex digest", () => {
    const sig = signPayload("secret", "body");
    expect(sig).toBe(signPayload("secret", "body"));
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with the secret and the body", () => {
    expect(signPayload("a", "body")).not.toBe(signPayload("b", "body"));
    expect(signPayload("secret", "x")).not.toBe(signPayload("secret", "y"));
  });
});

describe("isEventSubscribed", () => {
  it("matches '*' and exact event types, rejects misses", () => {
    expect(isEventSubscribed(["*"], "ticket.created")).toBe(true);
    expect(isEventSubscribed(["ticket.created"], "ticket.created")).toBe(true);
    expect(isEventSubscribed(["ticket.created"], "ticket.closed")).toBe(false);
    expect(isEventSubscribed([], "ticket.created")).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows exponentially from 30s and caps at 30m", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(99)).toBe(30 * 60_000); // capped
  });
});
