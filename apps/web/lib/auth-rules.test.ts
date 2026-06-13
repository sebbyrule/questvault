import { describe, it, expect } from "vitest";
import {
  hashToken,
  isInviteUsable,
  isSelfLockout,
  isSelfDeactivate,
  registerSchema,
  inviteSchema,
  acceptSchema,
} from "./auth-rules";

describe("hashToken", () => {
  it("is deterministic and never returns the raw token", () => {
    const raw = "invitetoken_abc123";
    const h = hashToken(raw);
    expect(h).toBe(hashToken(raw));
    expect(h).not.toBe(raw);
    expect(h).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("differs for different inputs", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("isInviteUsable", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");
  const future = new Date("2026-06-20T12:00:00.000Z");
  const past = new Date("2026-06-10T12:00:00.000Z");

  it("is true when pending and not expired", () => {
    expect(isInviteUsable({ acceptedAt: null, expiresAt: future }, now)).toBe(true);
  });

  it("is false once accepted", () => {
    expect(isInviteUsable({ acceptedAt: now, expiresAt: future }, now)).toBe(false);
  });

  it("is false when expired", () => {
    expect(isInviteUsable({ acceptedAt: null, expiresAt: past }, now)).toBe(false);
  });
});

describe("self-lockout guards", () => {
  it("isSelfLockout blocks an admin demoting themselves below admin/owner", () => {
    expect(isSelfLockout("u1", "u1", "member")).toBe(true);
    expect(isSelfLockout("u1", "u1", "viewer")).toBe(true);
  });

  it("isSelfLockout allows self staying admin/owner, and any change to others", () => {
    expect(isSelfLockout("u1", "u1", "admin")).toBe(false);
    expect(isSelfLockout("u1", "u1", "owner")).toBe(false);
    expect(isSelfLockout("u1", "u2", "member")).toBe(false);
  });

  it("isSelfDeactivate is true only for one's own id", () => {
    expect(isSelfDeactivate("u1", "u1")).toBe(true);
    expect(isSelfDeactivate("u1", "u2")).toBe(false);
  });
});

describe("schemas", () => {
  it("registerSchema rejects short passwords and bad emails", () => {
    expect(registerSchema.safeParse({ displayName: "A", email: "x@y.com", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ displayName: "A", email: "nope", password: "longenough" }).success).toBe(false);
    expect(registerSchema.safeParse({ displayName: "A", email: "x@y.com", password: "longenough" }).success).toBe(true);
  });

  it("inviteSchema enforces the role enum", () => {
    expect(inviteSchema.safeParse({ email: "x@y.com", role: "member" }).success).toBe(true);
    expect(inviteSchema.safeParse({ email: "x@y.com", role: "superuser" }).success).toBe(false);
  });

  it("acceptSchema requires a token, name, and 8+ char password", () => {
    expect(acceptSchema.safeParse({ token: "t", displayName: "A", password: "longenough" }).success).toBe(true);
    expect(acceptSchema.safeParse({ token: "", displayName: "A", password: "longenough" }).success).toBe(false);
    expect(acceptSchema.safeParse({ token: "t", displayName: "A", password: "short" }).success).toBe(false);
  });
});
