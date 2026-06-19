import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { jsonb } from "./json";
import { users } from "./users";

// ─── Webhooks ─────────────────────────────────────────────────────────────────
// Outbound event subscriptions. Each delivery is HMAC-signed with `secret`
// (X-QuestVault-Signature). `events` is a subscription list (event types, or
// ["*"] for all).

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  // Signing secret — stored (needed to sign every delivery) and shown to the admin.
  secret: text("secret").notNull(),
  events: jsonb<string[]>("events").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Deliveries ───────────────────────────────────────────────────────────
// One retryable delivery record per (webhook, event). The background worker
// dispatches it (off the request path) and retries with exponential backoff,
// updating the row in place. `payload` is stored so a delivery can be retried
// and manually redelivered with a stable, identically-signed body.

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    // "pending" (queued / awaiting retry) | "success" | "failed" (retries exhausted)
    status: text("status").notNull(),
    // The event `data` — the signed body is rebuilt deterministically from this
    // + the row id/createdAt, so retries carry an identical signature.
    payload: jsonb<Record<string, unknown>>("payload"),
    attempts: integer("attempts").notNull().default(0),
    // When the next attempt is due (set while pending; null once terminal).
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    responseStatus: integer("response_status"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    webhookIdIdx: index("webhook_deliveries_webhook_id_idx").on(t.webhookId),
    createdAtIdx: index("webhook_deliveries_created_at_idx").on(t.createdAt),
    // Drives the worker's "due deliveries" sweep.
    dueIdx: index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt),
  })
);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
