/**
 * Pure streak + action-mapping helpers (no DB). Used by the web XP bridge
 * (apps/web/lib/xp.ts) and unit-tested here. Day boundaries are UTC.
 */

// Canonical XP action names — mirrors the xp_action pg enum in @questvault/db.
export type XpAction =
  | "ticket_created"
  | "ticket_closed_p2_p3"
  | "ticket_closed_p0_p1"
  | "pr_linked"
  | "review_submitted"
  | "sprint_completed"
  | "streak_maintained"
  | "badge_unlocked";

/** Whole-day index in UTC (days since the epoch). */
export function utcDayNumber(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

/** Start of the UTC day containing `d`. */
export function utcMidnight(d: Date): Date {
  return new Date(utcDayNumber(d) * 86_400_000);
}

/**
 * The ticket_closed rule reports a generic "ticket_closed" action, but the
 * xp_action enum (and DAILY_CAPS) split it by priority. Everything else maps
 * 1:1 to an enum value.
 */
export function storedAction(action: string, priority?: string): XpAction {
  if (action === "ticket_closed") {
    return priority === "p0" || priority === "p1"
      ? "ticket_closed_p0_p1"
      : "ticket_closed_p2_p3";
  }
  return action as XpAction;
}

/** Daily streak transition based on last activity (UTC days). */
export function nextStreak(current: number, lastActiveAt: Date | null, now: Date): number {
  if (!lastActiveAt) return 1;
  const last = utcDayNumber(lastActiveAt);
  const today = utcDayNumber(now);
  if (last === today) return current || 1; // already counted today
  if (last === today - 1) return current + 1; // consecutive day
  return 1; // a gap resets the streak
}
