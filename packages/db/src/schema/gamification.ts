import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  pgEnum,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";
import { projects } from "./projects";

// ─── XP Events ────────────────────────────────────────────────────────────────

export const xpActionEnum = pgEnum("xp_action", [
  "ticket_created",
  "ticket_closed_p2_p3",
  "ticket_closed_p0_p1",
  "pr_linked",
  "review_submitted",
  "sprint_completed",
  "streak_maintained",
  "badge_unlocked",
]);

export const xpEvents = pgTable(
  "xp_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: xpActionEnum("action").notNull(),
    xpAwarded: integer("xp_awarded").notNull(),
    // The ticket, sprint, PR, etc. that triggered this
    entityId: uuid("entity_id"),
    entityType: text("entity_type"), // "ticket" | "sprint" | "pr"
    // Streak multiplier, quality flags, anti-gaming notes
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    // Set to true if held pending anti-gaming review
    isPending: boolean("is_pending").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdIdx: index("xp_events_user_id_idx").on(t.userId),
    createdAtIdx: index("xp_events_created_at_idx").on(t.createdAt),
    // SDD §4.1: negative XP awards are not permitted.
    xpNonNegative: check(
      "xp_events_xp_awarded_non_negative",
      sql`${t.xpAwarded} >= 0`
    ),
  })
);

// ─── Badges ───────────────────────────────────────────────────────────────────

export const badgeCategoryEnum = pgEnum("badge_category", [
  "milestone",  // e.g. first ticket, 100 tickets
  "quality",    // e.g. zero-bug sprint
  "social",     // e.g. top reviewer this week
  "streak",     // e.g. 7-day streak
  "special",    // seasonal / admin-granted
]);

export const badges = pgTable("badges", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(), // e.g. "first-ticket"
  name: text("name").notNull(),
  description: text("description").notNull(),
  iconEmoji: text("icon_emoji").notNull().default("🏆"),
  category: badgeCategoryEnum("category").notNull(),
  xpReward: integer("xp_reward").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userBadges = pgTable("user_badges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  badgeId: uuid("badge_id")
    .notNull()
    .references(() => badges.id),
  awardedAt: timestamp("awarded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Agent Audit Log ──────────────────────────────────────────────────────────
// Immutable record of every action taken by an MCP agent.

export const agentAuditLog = pgTable(
  "agent_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id").notNull(), // The agent token identifier
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    toolName: text("tool_name").notNull(),
    // SHA-256 of the input JSON — never store raw input (may contain secrets)
    inputHash: text("input_hash").notNull(),
    // Brief human-readable summary of what was done
    outputSummary: text("output_summary"),
    durationMs: integer("duration_ms"),
    success: boolean("success").notNull().default(true),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    agentIdIdx: index("agent_audit_log_agent_id_idx").on(t.agentId),
    createdAtIdx: index("agent_audit_log_created_at_idx").on(t.createdAt),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const xpEventsRelations = relations(xpEvents, ({ one }) => ({
  user: one(users, { fields: [xpEvents.userId], references: [users.id] }),
}));

export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  user: one(users, { fields: [userBadges.userId], references: [users.id] }),
  badge: one(badges, { fields: [userBadges.badgeId], references: [badges.id] }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type XpEvent = typeof xpEvents.$inferSelect;
export type NewXpEvent = typeof xpEvents.$inferInsert;
export type Badge = typeof badges.$inferSelect;
export type UserBadge = typeof userBadges.$inferSelect;
export type AgentAuditLog = typeof agentAuditLog.$inferSelect;
