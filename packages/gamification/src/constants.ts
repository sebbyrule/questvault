// ─── XP Base Amounts ──────────────────────────────────────────────────────────

export const XP = {
  TICKET_CREATED:        5,
  TICKET_CLOSED_P2_P3:  20,
  TICKET_CLOSED_P0_P1:  40,
  PR_LINKED:            10,
  REVIEW_SUBMITTED:     15,
  SPRINT_COMPLETED:     50,
  BADGE_UNLOCKED:        0, // badge sets its own xp_reward
} as const;

// ─── Daily Caps (per action type, per user) ───────────────────────────────────

export const DAILY_CAPS: Record<string, number> = {
  ticket_created:       20,  // max 4 tickets awarded per day
  ticket_closed_p2_p3:  80,  // max 4 closes
  ticket_closed_p0_p1:  80,
  pr_linked:            30,
  review_submitted:     60,  // max 4 reviews
};

// ─── Streak Multiplier ────────────────────────────────────────────────────────

export const STREAK_MULTIPLIER_PER_DAY = 0.05;  // +5% per streak day
export const STREAK_MULTIPLIER_MAX     = 0.50;  // capped at +50%

// ─── Anti-Gaming Thresholds ───────────────────────────────────────────────────

// Ticket must be open at least this long before close XP is awarded
export const MIN_TICKET_OPEN_MINUTES = 60;

// If a user closes > (rolling_avg * VELOCITY_ANOMALY_MULTIPLIER) tickets in one
// day — across all priorities — the close is treated as anomalous. (The current
// implementation blocks the XP; holding it pending review is future work.)
export const VELOCITY_ANOMALY_MULTIPLIER = 3;
export const VELOCITY_ROLLING_DAYS       = 14;
// Absolute floor so low-volume users are never flagged: a day must reach at least
// this many closes before the velocity ratio can trip.
export const VELOCITY_MIN_DAILY_CLOSES   = 4;

// ─── Level Formula ────────────────────────────────────────────────────────────
// Level = floor(sqrt(xpTotal / 50))

export function xpToLevel(xpTotal: number): number {
  return Math.floor(Math.sqrt(xpTotal / 50));
}

export function levelToMinXp(level: number): number {
  return level * level * 50;
}
