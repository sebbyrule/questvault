import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, userRoleEnum } from "./users";

// ─── Invites ──────────────────────────────────────────────────────────────────
// One-time, time-limited invitation links. The raw token lives only in the URL;
// we store its SHA-256 hash. `accepted_at` enforces single use.

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    // Workspace role granted when the invite is accepted.
    role: userRoleEnum("role").notNull().default("member"),
    // SHA-256 of the raw token (never store the raw token).
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIdx: index("invites_email_idx").on(t.email),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const invitesRelations = relations(invites, ({ one }) => ({
  inviter: one(users, { fields: [invites.invitedBy], references: [users.id] }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
