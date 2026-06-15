import { describe, it, expect } from "vitest";
// Import directly (not the package index) to stay DB-free.
import { signPayload, isEventSubscribed } from "./webhooks";

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
