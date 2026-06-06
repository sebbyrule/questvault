import { z } from "zod";
import {
  XP,
  DAILY_CAPS,
  STREAK_MULTIPLIER_PER_DAY,
  STREAK_MULTIPLIER_MAX,
  MIN_TICKET_OPEN_MINUTES,
} from "./constants";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface XpAward {
  xp: number;
  action: string;
  entityId: string;
  entityType: string;
  metadata: Record<string, unknown>;
}

export interface GuardContext {
  userId: string;
  // Daily XP already awarded today per action (from Redis or DB)
  dailyXpByAction: Record<string, number>;
  // Rolling 14-day daily closes (for velocity check)
  rollingDailyCloses: number[];
  streakDays: number;
}

export type GuardResult =
  | { pass: true }
  | { pass: false; reason: string };

// ─── Rule Definition ──────────────────────────────────────────────────────────

export interface XpRule<TInput> {
  action: string;
  schema: z.ZodType<TInput>;
  // Returns null if no XP should be awarded; otherwise the base XP amount
  baseXp(input: TInput): number | null;
  guards: Array<(input: TInput, ctx: GuardContext) => GuardResult>;
  applyMultipliers(baseXp: number, ctx: GuardContext): number;
}

// ─── Shared Multiplier ────────────────────────────────────────────────────────

function streakMultiplier(baseXp: number, ctx: GuardContext): number {
  const multiplier = Math.min(
    ctx.streakDays * STREAK_MULTIPLIER_PER_DAY,
    STREAK_MULTIPLIER_MAX
  );
  // Floor so streaks never over-award XP (anti-gaming).
  return Math.floor(baseXp * (1 + multiplier));
}

function dailyCapGuard(action: string) {
  return (_input: unknown, ctx: GuardContext): GuardResult => {
    const cap = DAILY_CAPS[action];
    if (cap === undefined) return { pass: true };
    const alreadyAwarded = ctx.dailyXpByAction[action] ?? 0;
    if (alreadyAwarded >= cap) {
      return { pass: false, reason: `Daily cap reached for ${action} (${cap} XP)` };
    }
    return { pass: true };
  };
}

// ─── Rule: ticket_created ─────────────────────────────────────────────────────

const ticketCreatedSchema = z.object({
  ticketId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  assigneeId: z.string().uuid().nullable(),
});

type TicketCreatedInput = z.infer<typeof ticketCreatedSchema>;

export const ticketCreatedRule: XpRule<TicketCreatedInput> = {
  action: "ticket_created",
  schema: ticketCreatedSchema,
  baseXp(input) {
    // Quality gate: must have description AND assignee
    if (!input.description || input.description.trim().length < 10) return null;
    if (!input.assigneeId) return null;
    return XP.TICKET_CREATED;
  },
  guards: [dailyCapGuard("ticket_created")],
  applyMultipliers: streakMultiplier,
};

// ─── Rule: ticket_closed ──────────────────────────────────────────────────────

const ticketClosedSchema = z.object({
  ticketId: z.string().uuid(),
  priority: z.enum(["p0", "p1", "p2", "p3"]),
  openedAt: z.date(),
  closedAt: z.date(),
});

type TicketClosedInput = z.infer<typeof ticketClosedSchema>;

export const ticketClosedRule: XpRule<TicketClosedInput> = {
  action: "ticket_closed",
  schema: ticketClosedSchema,
  baseXp(input) {
    const openMinutes =
      (input.closedAt.getTime() - input.openedAt.getTime()) / 60_000;
    if (openMinutes < MIN_TICKET_OPEN_MINUTES) return null;
    return input.priority === "p0" || input.priority === "p1"
      ? XP.TICKET_CLOSED_P0_P1
      : XP.TICKET_CLOSED_P2_P3;
  },
  guards: [
    (input, ctx) => dailyCapGuard(
      input.priority === "p0" || input.priority === "p1"
        ? "ticket_closed_p0_p1"
        : "ticket_closed_p2_p3"
    )(input, ctx),
  ],
  applyMultipliers: streakMultiplier,
};

// ─── Rule: pr_linked ─────────────────────────────────────────────────────────

const prLinkedSchema = z.object({
  ticketId: z.string().uuid(),
  prUrl: z.string().url(),
});

export const prLinkedRule: XpRule<z.infer<typeof prLinkedSchema>> = {
  action: "pr_linked",
  schema: prLinkedSchema,
  baseXp: () => XP.PR_LINKED,
  guards: [dailyCapGuard("pr_linked")],
  applyMultipliers: streakMultiplier,
};

// ─── Rule: review_submitted ───────────────────────────────────────────────────

const reviewSubmittedSchema = z.object({
  prId: z.string(),
  reviewerId: z.string().uuid(),
  authorId: z.string().uuid(),
  hasInlineComments: z.boolean(),
});

export const reviewSubmittedRule: XpRule<z.infer<typeof reviewSubmittedSchema>> = {
  action: "review_submitted",
  schema: reviewSubmittedSchema,
  baseXp(input) {
    // No self-review XP
    if (input.reviewerId === input.authorId) return null;
    // Must include inline comments (not a rubber-stamp)
    if (!input.hasInlineComments) return null;
    return XP.REVIEW_SUBMITTED;
  },
  guards: [dailyCapGuard("review_submitted")],
  applyMultipliers: streakMultiplier,
};

// ─── Rule: sprint_completed ───────────────────────────────────────────────────

const sprintCompletedSchema = z.object({
  sprintId: z.string().uuid(),
  committedPoints: z.number().int().nonnegative(),
  deliveredPoints: z.number().int().nonnegative(),
});

export const sprintCompletedRule: XpRule<z.infer<typeof sprintCompletedSchema>> = {
  action: "sprint_completed",
  schema: sprintCompletedSchema,
  baseXp(input) {
    if (input.committedPoints === 0) return null;
    const completionRate = input.deliveredPoints / input.committedPoints;
    // Must deliver >= 80% of committed points
    if (completionRate < 0.8) return null;
    return XP.SPRINT_COMPLETED;
  },
  guards: [],
  applyMultipliers: (baseXp) => baseXp, // No streak multiplier on sprint bonus
};

// ─── Registry ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_RULES: XpRule<any>[] = [
  ticketCreatedRule,
  ticketClosedRule,
  prLinkedRule,
  reviewSubmittedRule,
  sprintCompletedRule,
];
