import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "./json";
import { users } from "./users";
import { projects } from "./projects";

// ─── Template definition shape (stored as JSONB) ────────────────────────────
// The structural payload a template applies to a fresh project. Built-in presets
// (defined in the web app) and user-saved templates share this shape.

export interface TemplateLabel {
  name: string;
  color: string;
}
export interface TemplateTicket {
  title: string;
  description?: string;
  priority: "p0" | "p1" | "p2" | "p3";
  storyPoints?: number;
  labels?: string[]; // label names referencing TemplateDefinition.labels
}
export interface TemplateDefinition {
  labels: TemplateLabel[];
  sprint?: { name: string; goal?: string };
  tickets: TemplateTicket[];
}

// ─── User-saved templates ───────────────────────────────────────────────────

export const projectTemplates = pgTable("project_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  iconEmoji: text("icon_emoji").default("📋"),
  color: text("color").default("#534AB7"),
  definition: jsonb<TemplateDefinition>("definition").notNull(),
  sourceProjectId: uuid("source_project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectTemplate = typeof projectTemplates.$inferSelect;
export type NewProjectTemplate = typeof projectTemplates.$inferInsert;
