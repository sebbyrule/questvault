import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { jsonb } from "./json";
import { users } from "./users";

// ─── Agent tokens ─────────────────────────────────────────────────────────────
// Per-agent MCP credentials. The raw token lives only in the URL/header shown
// once at mint time; we store its SHA-256 hash. `scopes` is a per-tool allowlist
// (tool names, or ["*"] for all). Replaces the single shared MCP_AGENT_SECRET,
// which remains a dev fallback.

export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // SHA-256 of the raw token (never store the raw token).
    tokenHash: text("token_hash").notNull().unique(),
    // Allowed tool names, or ["*"] for all.
    scopes: jsonb<string[]>("scopes").notNull(),
    // Admin who minted the token.
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    // Which users row this agent's writes attribute to (defaults to the agent user).
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashIdx: index("agent_tokens_token_hash_idx").on(t.tokenHash),
  })
);

export type AgentToken = typeof agentTokens.$inferSelect;
export type NewAgentToken = typeof agentTokens.$inferInsert;
