import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Idempotency ledger for the background worker. The event bus is at-least-once,
 * so the worker records each domain event's `eventId` here inside the same
 * transaction as the side effect it triggers (e.g. an XP award). A redelivered
 * event hits the unique `event_id` and is skipped — making the side effect
 * exactly-once. Immutable; no `updated_at` (cf. agent_audit_log).
 */
export const processedEvents = pgTable("processed_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Text (not uuid) so fan-out side effects can use composite keys, e.g.
  // `<eventId>:<userId>` when one event awards several users (sprint completion).
  eventId: text("event_id").notNull().unique(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProcessedEvent = typeof processedEvents.$inferSelect;
