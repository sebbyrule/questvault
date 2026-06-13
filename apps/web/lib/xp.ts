/**
 * XP bridge — the seam between the pure rules engine (@questvault/gamification)
 * and the database. The gamification package stays pure (no DB import); this
 * module reads the context it needs, evaluates the matching rule, and persists
 * the result. It is consumed by the web server actions (lib/actions.ts).
 *
 * Phase 2 MVP (see ~/.claude/plans/woolly-pondering-seal.md):
 *   - awards are synchronous, inside the web server-action layer only
 *     (coach/MCP-driven changes go through @questvault/tools and do NOT mint XP);
 *   - day boundary for daily caps + streaks is UTC;
 *   - capped/quality-gated awards simply yield 0 XP — no `is_pending` rows yet.
 *
 * awardXp is best-effort: callers invoke it AFTER the core mutation has
 * committed, in a try/catch, so an XP failure can never block or roll back a
 * ticket create/edit.
 */
import {
  db,
  eq,
  and,
  gte,
  inArray,
  sum,
  sql,
} from "@questvault/db";
import {
  xpEvents,
  users,
  badges,
  userBadges,
} from "@questvault/db/schema";
import {
  ALL_RULES,
  type GuardContext,
  nextStreak,
  storedAction,
  utcMidnight,
} from "@questvault/gamification";

export type BadgeUnlock = {
  slug: string;
  name: string;
  iconEmoji: string;
  xpReward: number;
};

export type AwardResult = {
  /** XP from the action's own rule (excludes badge xpReward). */
  xpAwarded: number;
  badges: BadgeUnlock[];
};

const EMPTY: AwardResult = { xpAwarded: 0, badges: [] };

export type AwardXpOpts = {
  userId: string;
  /** A rule action, e.g. "ticket_created" | "ticket_closed" | "pr_linked". */
  action: string;
  /** Validated by the matching rule's own zod schema. */
  input: unknown;
  entityId: string;
  entityType: "ticket" | "sprint" | "pr";
};

// ─── Helpers ────────────────────────────────────────────────────────────────
// nextStreak / storedAction / utcMidnight are pure domain logic and live in
// @questvault/gamification (unit-tested there).

/** Today's awarded XP per stored action, for the daily-cap guards. */
async function buildContext(userId: string, streakDays: number): Promise<GuardContext> {
  const rows = await db
    .select({ action: xpEvents.action, total: sum(xpEvents.xpAwarded) })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), gte(xpEvents.createdAt, utcMidnight(new Date()))))
    .groupBy(xpEvents.action);

  const dailyXpByAction: Record<string, number> = {};
  for (const r of rows) dailyXpByAction[r.action] = Number(r.total ?? 0);

  return {
    userId,
    dailyXpByAction,
    // No rule consumes the velocity check yet (constants exist, guard unwired).
    rollingDailyCloses: [],
    streakDays,
  };
}

/**
 * Award the seeded milestone/streak badges, idempotently. Inserts user_badges
 * + a badge_unlocked xp_event per unlock; does NOT touch users.xp_total — the
 * caller aggregates xpReward into a single user update.
 */
async function checkBadges(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  action: string,
  streakDays: number
): Promise<BadgeUnlock[]> {
  const wanted: string[] = [];
  if (action === "ticket_created") wanted.push("first-ticket");
  if (streakDays >= 5) wanted.push("streak-5");
  if (wanted.length === 0) return [];

  const defs = await tx.select().from(badges).where(inArray(badges.slug, wanted));
  if (defs.length === 0) return [];

  const owned = await tx
    .select({ badgeId: userBadges.badgeId })
    .from(userBadges)
    .where(
      and(
        eq(userBadges.userId, userId),
        inArray(
          userBadges.badgeId,
          defs.map((d) => d.id)
        )
      )
    );
  const ownedSet = new Set(owned.map((o) => o.badgeId));

  const unlocked: BadgeUnlock[] = [];
  for (const b of defs) {
    if (ownedSet.has(b.id)) continue;
    await tx.insert(userBadges).values({ userId, badgeId: b.id });
    if (b.xpReward > 0) {
      await tx.insert(xpEvents).values({
        userId,
        action: "badge_unlocked",
        xpAwarded: b.xpReward,
        entityId: b.id,
        entityType: "badge",
        metadata: { slug: b.slug },
      });
    }
    unlocked.push({
      slug: b.slug,
      name: b.name,
      iconEmoji: b.iconEmoji,
      xpReward: b.xpReward,
    });
  }
  return unlocked;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function awardXp(opts: AwardXpOpts): Promise<AwardResult> {
  const rule = ALL_RULES.find((r) => r.action === opts.action);
  if (!rule) return EMPTY;

  const parsed = rule.schema.safeParse(opts.input);
  if (!parsed.success) {
    console.warn(`[xp] invalid input for ${opts.action}:`, parsed.error.issues[0]?.message);
    return EMPTY;
  }
  const data = parsed.data as Record<string, unknown>;

  const [u] = await db
    .select({ streakDays: users.streakDays, lastActiveAt: users.lastActiveAt })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);
  if (!u) return EMPTY;

  // Evaluate the rule: quality gate (baseXp), guards (daily caps), multipliers.
  const base = rule.baseXp(data);
  let xp = 0;
  if (base != null) {
    const ctx = await buildContext(opts.userId, u.streakDays);
    const blocked = rule.guards.some((g) => !g(data, ctx).pass);
    xp = blocked ? 0 : rule.applyMultipliers(base, ctx);
  }

  const now = new Date();
  // Streak advances only on a real (awarded) action.
  const newStreak = xp > 0 ? nextStreak(u.streakDays, u.lastActiveAt, now) : u.streakDays;

  return db.transaction(async (tx) => {
    if (xp > 0) {
      await tx.insert(xpEvents).values({
        userId: opts.userId,
        action: storedAction(rule.action, data.priority as string | undefined),
        xpAwarded: xp,
        entityId: opts.entityId,
        entityType: opts.entityType,
        metadata: { baseXp: base, streakDays: newStreak },
      });
    }

    const badgeUnlocks = await checkBadges(tx, opts.userId, rule.action, newStreak);
    const badgeXp = badgeUnlocks.reduce((sum, b) => sum + b.xpReward, 0);

    const totalDelta = xp + badgeXp;
    if (totalDelta > 0 || newStreak !== u.streakDays) {
      await tx
        .update(users)
        .set({
          xpTotal: sql`${users.xpTotal} + ${totalDelta}`,
          streakDays: newStreak,
          lastActiveAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, opts.userId));
    }

    return { xpAwarded: xp, badges: badgeUnlocks };
  });
}
