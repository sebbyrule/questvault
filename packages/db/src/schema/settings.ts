import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

// ─── Workspace settings ─────────────────────────────────────────────────────
// Single-row table for the whole workspace. All override columns are nullable —
// null means "fall back to the environment variable". The fixed `id` keeps it a
// singleton (one row, addressed as 'workspace').

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("workspace"),

  // LLM integration — override the LLM_* / ANTHROPIC_* env vars.
  llmProvider: text("llm_provider"), // "lmstudio" | "anthropic"
  llmModel: text("llm_model"),
  llmBaseUrl: text("llm_base_url"), // LM Studio base URL
  llmApiKey: text("llm_api_key"), // Anthropic key (or LM Studio key)

  // Coach/agent behavior.
  skillsMd: text("skills_md"), // appended to the coach system prompt
  workingDir: text("working_dir"), // stored for a future autonomous-agent runtime
  // Allowlist of tool names the coach may call; null = all tools allowed.
  enabledTools: jsonb("enabled_tools").$type<string[] | null>(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;
