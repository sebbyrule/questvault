import { describe, it, expect } from "vitest";
import {
  ticketCreatedRule,
  ticketClosedRule,
  sprintCompletedRule,
  reviewSubmittedRule,
  type GuardContext,
} from "./rules.js";

const baseCtx: GuardContext = {
  userId: "00000000-0000-0000-0000-000000000001",
  dailyXpByAction: {},
  rollingDailyCloses: [],
  streakDays: 0,
};

// ─── ticket_created ───────────────────────────────────────────────────────────

describe("ticketCreatedRule", () => {
  it("awards XP when description and assignee are present", () => {
    const xp = ticketCreatedRule.baseXp({
      ticketId: "00000000-0000-0000-0000-000000000002",
      title: "Fix login bug",
      description: "Users are unable to log in via GitHub OAuth.",
      assigneeId: "00000000-0000-0000-0000-000000000003",
    });
    expect(xp).toBe(5);
  });

  it("returns null when description is missing", () => {
    const xp = ticketCreatedRule.baseXp({
      ticketId: "00000000-0000-0000-0000-000000000002",
      title: "Fix login bug",
      description: null,
      assigneeId: "00000000-0000-0000-0000-000000000003",
    });
    expect(xp).toBeNull();
  });

  it("returns null when assignee is missing", () => {
    const xp = ticketCreatedRule.baseXp({
      ticketId: "00000000-0000-0000-0000-000000000002",
      title: "Fix login bug",
      description: "Some description here.",
      assigneeId: null,
    });
    expect(xp).toBeNull();
  });

  it("blocks award when daily cap is reached", () => {
    const ctx: GuardContext = {
      ...baseCtx,
      dailyXpByAction: { ticket_created: 20 },
    };
    const result = ticketCreatedRule.guards[0]!(
      { ticketId: "x", title: "x", description: "x", assigneeId: "x" },
      ctx
    );
    expect(result.pass).toBe(false);
  });

  it("applies streak multiplier", () => {
    const ctx: GuardContext = { ...baseCtx, streakDays: 10 };
    const boosted = ticketCreatedRule.applyMultipliers(5, ctx);
    expect(boosted).toBe(7); // 5 * (1 + 10 * 0.05) = 7.5 → 7
  });

  it("caps streak multiplier at 50%", () => {
    const ctx: GuardContext = { ...baseCtx, streakDays: 100 };
    const boosted = ticketCreatedRule.applyMultipliers(20, ctx);
    expect(boosted).toBe(30); // 20 * 1.5 = 30
  });
});

// ─── ticket_closed ────────────────────────────────────────────────────────────

describe("ticketClosedRule", () => {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);

  it("awards 20 XP for P2 ticket open > 1 hour", () => {
    const xp = ticketClosedRule.baseXp({
      ticketId: "id",
      priority: "p2",
      openedAt: twoHoursAgo,
      closedAt: now,
    });
    expect(xp).toBe(20);
  });

  it("awards 40 XP for P0 ticket", () => {
    const xp = ticketClosedRule.baseXp({
      ticketId: "id",
      priority: "p0",
      openedAt: twoHoursAgo,
      closedAt: now,
    });
    expect(xp).toBe(40);
  });

  it("returns null if ticket closed within 1 hour (farming guard)", () => {
    const xp = ticketClosedRule.baseXp({
      ticketId: "id",
      priority: "p2",
      openedAt: thirtyMinsAgo,
      closedAt: now,
    });
    expect(xp).toBeNull();
  });
});

// ─── sprint_completed ─────────────────────────────────────────────────────────

describe("sprintCompletedRule", () => {
  it("awards 50 XP when >= 80% delivered", () => {
    const xp = sprintCompletedRule.baseXp({
      sprintId: "id",
      committedPoints: 40,
      deliveredPoints: 34,
    });
    expect(xp).toBe(50);
  });

  it("returns null when < 80% delivered", () => {
    const xp = sprintCompletedRule.baseXp({
      sprintId: "id",
      committedPoints: 40,
      deliveredPoints: 30,
    });
    expect(xp).toBeNull();
  });
});

// ─── review_submitted ─────────────────────────────────────────────────────────

describe("reviewSubmittedRule", () => {
  it("awards XP for review with inline comments", () => {
    const xp = reviewSubmittedRule.baseXp({
      prId: "pr-1",
      reviewerId: "user-a",
      authorId: "user-b",
      hasInlineComments: true,
    });
    expect(xp).toBe(15);
  });

  it("returns null for self-review", () => {
    const xp = reviewSubmittedRule.baseXp({
      prId: "pr-1",
      reviewerId: "user-a",
      authorId: "user-a",
      hasInlineComments: true,
    });
    expect(xp).toBeNull();
  });

  it("returns null for rubber-stamp review (no inline comments)", () => {
    const xp = reviewSubmittedRule.baseXp({
      prId: "pr-1",
      reviewerId: "user-a",
      authorId: "user-b",
      hasInlineComments: false,
    });
    expect(xp).toBeNull();
  });
});
