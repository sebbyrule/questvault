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

// ─── Delivery log ───────────────────────────────────────────────────────────
// Lightweight per-attempt record (no payload stored). Best-effort delivery only;
// there is no background retry worker yet.

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    status: text("status").notNull(), // "success" | "failed"
    responseStatus: integer("response_status"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    webhookIdIdx: index("webhook_deliveries_webhook_id_idx").on(t.webhookId),
    createdAtIdx: index("webhook_deliveries_created_at_idx").on(t.createdAt),
  })
);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
