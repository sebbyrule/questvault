import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { projects } from "./projects";
import { sprints } from "./projects";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const ticketStatusEnum = pgEnum("ticket_status", [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "archived",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "p0", // Critical / incident
  "p1", // High
  "p2", // Medium
  "p3", // Low
]);

// ─── pgvector custom type ─────────────────────────────────────────────────────
// Requires the pgvector extension (installed via docker init script)

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
});

// ─── Tickets ──────────────────────────────────────────────────────────────────

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Identifier shown in UI: "QV-42"
    number: integer("number").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sprintId: uuid("sprint_id").references(() => sprints.id, {
      onDelete: "set null",
    }),
    // Self-referential for subtasks
    parentId: uuid("parent_id"),
    title: text("title").notNull(),
    description: text("description"), // Markdown
    status: ticketStatusEnum("status").notNull().default("backlog"),
    priority: ticketPriorityEnum("priority").notNull().default("p2"),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id),
    storyPoints: integer("story_points"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    // LexoRank for O(1) kanban reordering
    rank: text("rank").notNull().default("0|hzzzzz:"),
    // Semantic embedding (text-embedding-3-small = 1536 dims)
    embedding: vector("embedding"),
    // External integrations
    prUrl: text("pr_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => ({
    projectIdIdx: index("tickets_project_id_idx").on(t.projectId),
    assigneeIdIdx: index("tickets_assignee_id_idx").on(t.assigneeId),
    statusIdx: index("tickets_status_idx").on(t.status),
    sprintIdIdx: index("tickets_sprint_id_idx").on(t.sprintId),
    // Human-facing ticket number ("QV-42") must be unique within a project.
    projectNumberUnique: uniqueIndex("tickets_project_id_number_unique").on(
      t.projectId,
      t.number
    ),
    // Note: the HNSW index on `embedding` is created in a separate migration
    // (drizzle-kit cannot express vector index ops): see
    // 0001_add_triggers_and_hnsw.sql.
  })
);

// ─── Labels ───────────────────────────────────────────────────────────────────

export const labels = pgTable("labels", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#888780"),
});

export const ticketLabels = pgTable("ticket_labels", {
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  labelId: uuid("label_id")
    .notNull()
    .references(() => labels.id, { onDelete: "cascade" }),
});

// ─── Comments ─────────────────────────────────────────────────────────────────

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, {
    onDelete: "set null",
  }),
  // If null, comment was made by a human; if set, it's agent-authored
  agentId: text("agent_id"),
  body: text("body").notNull(), // Markdown
  isEdited: boolean("is_edited").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Ticket History (audit trail) ─────────────────────────────────────────────

export const ticketHistory = pgTable("ticket_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  agentId: text("agent_id"),
  field: text("field").notNull(), // e.g. "status", "assignee_id"
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  project: one(projects, {
    fields: [tickets.projectId],
    references: [projects.id],
  }),
  sprint: one(sprints, {
    fields: [tickets.sprintId],
    references: [sprints.id],
  }),
  assignee: one(users, {
    fields: [tickets.assigneeId],
    references: [users.id],
  }),
  reporter: one(users, {
    fields: [tickets.reporterId],
    references: [users.id],
  }),
  comments: many(comments),
  labels: many(ticketLabels),
  history: many(ticketHistory),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  ticket: one(tickets, {
    fields: [comments.ticketId],
    references: [tickets.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type TicketHistory = typeof ticketHistory.$inferSelect;
export type Label = typeof labels.$inferSelect;
