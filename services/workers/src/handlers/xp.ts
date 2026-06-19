/**
 * XP award handler — the worker-side home for gamification, fulfilling
 * AGENT.md's rule: "Never award XP inside a request handler. Publish an event;
 * let the gamification worker consume it."
 *
 * Ported from the old synchronous `apps/web/lib/xp.ts` bridge. The pure rules
 * engine (@questvault/gamification) stays DB-free; this evaluates the matching
 * rule and persists the result. Two differences from the web version:
 *   - it is driven by domain events (not called inline by a mutation), so
 *     coach/MCP-originated changes mint XP too; and
 *   - it is **idempotent** — the whole award runs in one transaction that first
 *     claims the event's id in `processed_events`; a redelivered event is a
 *     no-op (the bus is at-least-once).
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
  processedEvents,
} from "@questvault/db/schema";
import {
  ALL_RULES,
  type GuardContext,
  nextStreak,
  storedAction,
  utcMidnight,
} from "@questvault/gamification";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AwardXpOpts = {
  userId: string;
  action: string; // "ticket_created" | "ticket_closed" | "pr_linked"
  input: unknown; // validated by the matching rule's zod schema
  entityId: string;
  entityType: "ticket" | "sprint" | "pr";
};

export type AwardSummary = {
  skipped: boolean; // true when the event was already processed
  xpAwarded: number;
  badges: string[]; // unlocked badge slugs
};

const SKIPPED: AwardSummary = { skipped: true, xpAwarded: 0, badges: [] };
const NONE: AwardSummary = { skipped: false, xpAwarded: 0, badges: [] };

/** Today's awarded XP per stored action, for the daily-cap guards. */
async function buildContext(
  tx: Tx,
  userId: string,
  streakDays: number
): Promise<GuardContext> {
  const rows = await tx
    .select({ action: xpEvents.action, total: sum(xpEvents.xpAwarded) })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), gte(xpEvents.createdAt, utcMidnight(new Date()))))
    .groupBy(xpEvents.action);

  const dailyXpByAction: Record<string, number> = {};
  for (const r of rows) dailyXpByAction[r.action] = Number(r.total ?? 0);

  return {
    userId,
    dailyXpByAction,
    rollingDailyCloses: [], // velocity guard still unwired
    streakDays,
  };
}

/** Award the seeded milestone/streak badges idempotently; returns unlocked slugs. */
async function checkBadges(
  tx: Tx,
  userId: string,
  action: string,
  streakDays: number
): Promise<{ slugs: string[]; xp: number }> {
  const wanted: string[] = [];
  if (action === "ticket_created") wanted.push("first-ticket");
  if (streakDays >= 5) wanted.push("streak-5");
  if (wanted.length === 0) return { slugs: [], xp: 0 };

  const defs = await tx.select().from(badges).where(inArray(badges.slug, wanted));
  if (defs.length === 0) return { slugs: [], xp: 0 };

  const owned = await tx
    .select({ badgeId: userBadges.badgeId })
    .from(userBadges)
    .where(
      and(
        eq(userBadges.userId, userId),
        inArray(userBadges.badgeId, defs.map((d) => d.id))
      )
    );
  const ownedSet = new Set(owned.map((o) => o.badgeId));

  const slugs: string[] = [];
  let xp = 0;
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
      xp += b.xpReward;
    }
    slugs.push(b.slug);
  }
  return { slugs, xp };
}

/**
 * Award XP for one domain event, exactly once. Returns a summary for logging.
 * Throwing (e.g. a transient DB error) rolls back the `processed_events` claim
 * too, so the event stays pending and is safely retried.
 */
export async function awardXpForEvent(
  eventId: string,
  opts: AwardXpOpts
): Promise<AwardSummary> {
  const rule = ALL_RULES.find((r) => r.action === opts.action);
  if (!rule) return NONE;

  const parsed = rule.schema.safeParse(opts.input);
  if (!parsed.success) {
    console.warn(`[worker:xp] invalid input for ${opts.action}:`, parsed.error.issues[0]?.message);
    // Claim the event so we don't retry a structurally-invalid payload forever.
    return claimOnly(eventId);
  }
  const data = parsed.data as Record<string, unknown>;

  return db.transaction(async (tx) => {
    // Idempotency gate: claim the event id; bail if already processed.
    const claim = await tx
      .insert(processedEvents)
      .values({ eventId })
      .onConflictDoNothing({ target: processedEvents.eventId })
      .returning({ id: processedEvents.id });
    if (claim.length === 0) return SKIPPED;

    const [u] = await tx
      .select({ streakDays: users.streakDays, lastActiveAt: users.lastActiveAt })
      .from(users)
      .where(eq(users.id, opts.userId))
      .limit(1);
    if (!u) return NONE;

    // Evaluate the rule: quality gate (baseXp), guards (daily caps), multipliers.
    const base = rule.baseXp(data);
    let xp = 0;
    if (base != null) {
      const ctx = await buildContext(tx, opts.userId, u.streakDays);
      const blocked = rule.guards.some((g) => !g(data, ctx).pass);
      xp = blocked ? 0 : rule.applyMultipliers(base, ctx);
    }

    const now = new Date();
    const newStreak = xp > 0 ? nextStreak(u.streakDays, u.lastActiveAt, now) : u.streakDays;

    if (xp > 0) {
      await tx.insert(xpEvents).values({
        userId: opts.userId,
        action: storedAction(rule.action, data.priority as string | undefined),
        xpAwarded: xp,
        entityId: opts.entityId,
        entityType: opts.entityType,
        metadata: { baseXp: base, streakDays: newStreak, eventId },
      });
    }

    const badge = await checkBadges(tx, opts.userId, rule.action, newStreak);
    const totalDelta = xp + badge.xp;

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

    return { skipped: false, xpAwarded: xp, badges: badge.slugs };
  });
}

/** Claim an event id without awarding (invalid payloads). Idempotent. */
async function claimOnly(eventId: string): Promise<AwardSummary> {
  const claim = await db
    .insert(processedEvents)
    .values({ eventId })
    .onConflictDoNothing({ target: processedEvents.eventId })
    .returning({ id: processedEvents.id });
  return claim.length === 0 ? SKIPPED : NONE;
}
