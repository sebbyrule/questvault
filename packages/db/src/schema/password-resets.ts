import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// ─── Password resets ────────────────────────────────────────────────────────
// One-time, time-limited password-reset links (admin-initiated; no email yet).
// The raw token lives only in the URL; we store its SHA-256 hash. `used_at`
// enforces single use.

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("password_resets_user_id_idx").on(t.userId),
  })
);

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, { fields: [passwordResets.userId], references: [users.id] }),
}));

export type PasswordReset = typeof passwordResets.$inferSelect;
export type NewPasswordReset = typeof passwordResets.$inferInsert;
