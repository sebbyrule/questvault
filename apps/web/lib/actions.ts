"use server";

/**
 * Server actions for ticket/project mutations. These run on the server and
 * write through @questvault/db, then revalidate the affected pages. Writes are
 * attributed to the Auth.js session user via getCurrentUser().
 */
import { db, eq, and, max, inArray } from "@questvault/db";
import {
  tickets,
  comments,
  ticketHistory,
  ticketLabels,
  labels,
  users,
  sprints,
  projects,
  projectMembers,
} from "@questvault/db/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "./queries";
import { uniqueProjectSlug } from "./slug";
import { awardXp, type AwardXpOpts, type AwardResult } from "./xp";

/** Award XP without ever letting a gamification failure break the mutation. */
async function tryAward(opts: AwardXpOpts): Promise<AwardResult> {
  try {
    return await awardXp(opts);
  } catch (err) {
    console.error("[xp] award failed:", err);
    return { xpAwarded: 0, badges: [] };
  }
}

/** Revalidate every page a ticket mutation can affect. */
function revalidateTicket(ticketId: string) {
  revalidatePath(`/board/${ticketId}`);
  revalidatePath("/board");
  revalidatePath("/dashboard");
}

const statusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
]);

export async function moveTicket(ticketId: string, status: string) {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status" };

  const current = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    columns: { status: true, priority: true, assigneeId: true, createdAt: true },
  });
  if (!current) return { ok: false, error: "Ticket not found" };

  const now = new Date();
  const set: Record<string, unknown> = { status: parsed.data, updatedAt: now };
  set.closedAt = parsed.data === "done" ? now : null;

  await db.update(tickets).set(set).where(eq(tickets.id, ticketId));

  // Award ticket_closed on the transition INTO done (credit the assignee if
  // any, else the actor performing the move).
  let award: AwardResult = { xpAwarded: 0, badges: [] };
  if (parsed.data === "done" && current.status !== "done") {
    const actor = await getCurrentUser();
    const earnerId = current.assigneeId ?? actor?.id;
    if (earnerId) {
      award = await tryAward({
        userId: earnerId,
        action: "ticket_closed",
        input: {
          ticketId,
          priority: current.priority,
          openedAt: current.createdAt,
          closedAt: now,
        },
        entityId: ticketId,
        entityType: "ticket",
      });
    }
  }

  revalidatePath("/board");
  revalidatePath("/dashboard");
  return { ok: true, ...award };
}

const createSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  priority: z.enum(["p0", "p1", "p2", "p3"]).default("p2"),
});

export async function createTicket(input: z.input<typeof createSchema>) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid ticket" };
  const { projectId, title, description, priority } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const reporterId = user.id;

  // Next per-project ticket number. (Single-writer dev path; the
  // unique (project_id, number) constraint guards against collisions.)
  const [row] = await db
    .select({ maxNumber: max(tickets.number) })
    .from(tickets)
    .where(eq(tickets.projectId, projectId));
  const number = (row?.maxNumber ?? 0) + 1;

  const [created] = await db
    .insert(tickets)
    .values({
      number,
      projectId,
      reporterId,
      title,
      description,
      priority,
      status: "backlog",
    })
    .returning({ id: tickets.id });

  // Award ticket_created XP to the reporter. Plain creates fail the rule's
  // quality gate (no assignee) → 0 XP by design, but the first-ticket badge
  // still unlocks here.
  const award = created
    ? await tryAward({
        userId: reporterId,
        action: "ticket_created",
        input: {
          ticketId: created.id,
          title,
          description: description ?? null,
          assigneeId: null,
        },
        entityId: created.id,
        entityType: "ticket",
      })
    : { xpAwarded: 0, badges: [] };

  revalidatePath("/board");
  revalidatePath("/dashboard");
  return { ok: true, ...award };
}

// ─── Ticket detail editing ────────────────────────────────────────────────────

const editSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z
    .enum(["backlog", "todo", "in_progress", "in_review", "done", "archived"])
    .optional(),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  storyPoints: z.number().int().min(1).max(21).nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  prUrl: z.string().url().nullable().optional(),
});

export type EditTicketInput = z.input<typeof editSchema>;

// Resolve human-readable names for the activity feed (only called on change).
async function userName(id: string | null): Promise<string> {
  if (!id) return "Unassigned";
  const [u] = await db
    .select({ n: users.displayName })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return u?.n ?? "Unknown";
}

async function sprintName(id: string | null): Promise<string> {
  if (!id) return "No sprint";
  const [s] = await db
    .select({ n: sprints.name })
    .from(sprints)
    .where(eq(sprints.id, id))
    .limit(1);
  return s?.n ?? "Unknown sprint";
}

type FieldChange = { field: string; oldValue: string | null; newValue: string | null };

/**
 * Partial-update a ticket's fields and record an entry in ticket_history for
 * each changed field. Update + history rows are written in one transaction.
 */
export async function updateTicketDetails(ticketId: string, patch: EditTicketInput) {
  const parsed = editSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid changes" };
  }
  const input = parsed.data;

  const current = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
    columns: { embedding: false },
  });
  if (!current) return { ok: false, error: "Ticket not found" };

  const actor = await getCurrentUser();
  const set: Partial<typeof tickets.$inferInsert> = {};
  const changes: FieldChange[] = [];

  if (input.title !== undefined && input.title !== current.title) {
    set.title = input.title;
    changes.push({ field: "title", oldValue: current.title, newValue: input.title });
  }

  if (
    input.description !== undefined &&
    (input.description ?? null) !== (current.description ?? null)
  ) {
    set.description = input.description ?? null;
    changes.push({
      field: "description",
      oldValue: current.description,
      newValue: input.description ?? null,
    });
  }

  if (input.status !== undefined && input.status !== current.status) {
    set.status = input.status;
    if (input.status === "done") set.closedAt = new Date();
    else if (current.status === "done") set.closedAt = null;
    changes.push({ field: "status", oldValue: current.status, newValue: input.status });
  }

  if (input.priority !== undefined && input.priority !== current.priority) {
    set.priority = input.priority;
    changes.push({ field: "priority", oldValue: current.priority, newValue: input.priority });
  }

  if (
    input.storyPoints !== undefined &&
    (input.storyPoints ?? null) !== (current.storyPoints ?? null)
  ) {
    set.storyPoints = input.storyPoints ?? null;
    changes.push({
      field: "story_points",
      oldValue: current.storyPoints?.toString() ?? null,
      newValue: input.storyPoints?.toString() ?? null,
    });
  }

  if (
    input.assigneeId !== undefined &&
    (input.assigneeId ?? null) !== (current.assigneeId ?? null)
  ) {
    set.assigneeId = input.assigneeId ?? null;
    changes.push({
      field: "assignee",
      oldValue: await userName(current.assigneeId),
      newValue: await userName(input.assigneeId ?? null),
    });
  }

  if (
    input.sprintId !== undefined &&
    (input.sprintId ?? null) !== (current.sprintId ?? null)
  ) {
    set.sprintId = input.sprintId ?? null;
    changes.push({
      field: "sprint",
      oldValue: await sprintName(current.sprintId),
      newValue: await sprintName(input.sprintId ?? null),
    });
  }

  if (input.dueDate !== undefined) {
    const newDue = input.dueDate ? new Date(input.dueDate) : null;
    if ((newDue?.getTime() ?? null) !== (current.dueDate?.getTime() ?? null)) {
      set.dueDate = newDue;
      changes.push({
        field: "due_date",
        oldValue: current.dueDate ? current.dueDate.toISOString() : null,
        newValue: newDue ? newDue.toISOString() : null,
      });
    }
  }

  if (input.prUrl !== undefined && (input.prUrl ?? null) !== (current.prUrl ?? null)) {
    set.prUrl = input.prUrl ?? null;
    changes.push({ field: "pr_url", oldValue: current.prUrl, newValue: input.prUrl ?? null });
  }

  if (changes.length === 0) return { ok: true };
  set.updatedAt = new Date();

  await db.transaction(async (tx) => {
    await tx.update(tickets).set(set).where(eq(tickets.id, ticketId));
    await tx.insert(ticketHistory).values(
      changes.map((c) => ({
        ticketId,
        actorId: actor?.id ?? null,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
      }))
    );
  });

  // ── XP awards (best-effort, after the core update has committed) ──────────
  let xpAwarded = 0;
  const earnedBadges: AwardResult["badges"] = [];

  // Closed: transition INTO done. Credit the (effective) assignee, else actor.
  if (input.status === "done" && current.status !== "done") {
    const effectiveAssignee =
      input.assigneeId !== undefined ? input.assigneeId : current.assigneeId;
    const earnerId = effectiveAssignee ?? actor?.id;
    if (earnerId) {
      const a = await tryAward({
        userId: earnerId,
        action: "ticket_closed",
        input: {
          ticketId,
          priority: input.priority ?? current.priority,
          openedAt: current.createdAt,
          closedAt: new Date(),
        },
        entityId: ticketId,
        entityType: "ticket",
      });
      xpAwarded += a.xpAwarded;
      earnedBadges.push(...a.badges);
    }
  }

  // PR linked: prUrl goes from empty → a url. Credit the actor.
  if (input.prUrl && !current.prUrl && actor?.id) {
    const a = await tryAward({
      userId: actor.id,
      action: "pr_linked",
      input: { ticketId, prUrl: input.prUrl },
      entityId: ticketId,
      entityType: "pr",
    });
    xpAwarded += a.xpAwarded;
    earnedBadges.push(...a.badges);
  }

  revalidateTicket(ticketId);
  return { ok: true, xpAwarded, badges: earnedBadges };
}

// ─── Projects ─────────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().trim().max(500).optional(),
  iconEmoji: z.string().trim().max(8).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value")
    .optional(),
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;

/**
 * Create a project and add the current user as its owner. The slug is derived
 * from the name and de-duplicated against existing slugs (slug is unique).
 */
export async function createProject(input: CreateProjectInput) {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid project" };
  }
  const { name, description, iconEmoji, color } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const slug = await uniqueProjectSlug(name);

  const project = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(projects)
      .values({
        name,
        slug,
        description: description || null,
        ...(iconEmoji ? { iconEmoji } : {}),
        ...(color ? { color } : {}),
      })
      .returning();
    if (!created) throw new Error("Failed to create project");

    await tx.insert(projectMembers).values({
      projectId: created.id,
      userId: user.id,
      role: "owner",
    });
    return created;
  });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true as const, projectId: project.id, slug: project.slug };
}

// ─── Comments ─────────────────────────────────────────────────────────────────

const commentSchema = z.object({ body: z.string().min(1).max(5000) });

export async function addComment(ticketId: string, body: string) {
  const parsed = commentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: "Comment cannot be empty" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "No user to attribute the comment to" };

  await db.insert(comments).values({
    ticketId,
    authorId: user.id,
    body: parsed.data.body,
  });

  revalidateTicket(ticketId);
  return { ok: true };
}

export async function editComment(commentId: string, ticketId: string, body: string) {
  const parsed = commentSchema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: "Comment cannot be empty" };

  await db
    .update(comments)
    .set({ body: parsed.data.body, isEdited: true, updatedAt: new Date() })
    .where(eq(comments.id, commentId));

  revalidateTicket(ticketId);
  return { ok: true };
}

// ─── Labels ─────────────────────────────────────────────────────────────────

const labelIdsSchema = z.array(z.string().uuid());

/** Replace a ticket's labels with the given set, logging one history entry. */
export async function setTicketLabels(ticketId: string, labelIds: string[]) {
  const parsed = labelIdsSchema.safeParse(labelIds);
  if (!parsed.success) return { ok: false, error: "Invalid labels" };
  const nextIds = parsed.data;

  const currentRows = await db
    .select({ labelId: ticketLabels.labelId })
    .from(ticketLabels)
    .where(eq(ticketLabels.ticketId, ticketId));
  const currentIds = currentRows.map((r) => r.labelId);

  const currentSet = new Set(currentIds);
  const nextSet = new Set(nextIds);
  const unchanged =
    currentSet.size === nextSet.size &&
    Array.from(currentSet).every((id) => nextSet.has(id));
  if (unchanged) return { ok: true };

  // Resolve names for the activity feed.
  const allIds = Array.from(new Set([...currentIds, ...nextIds]));
  const nameRows = allIds.length
    ? await db
        .select({ id: labels.id, name: labels.name })
        .from(labels)
        .where(inArray(labels.id, allIds))
    : [];
  const nameById = new Map(nameRows.map((r) => [r.id, r.name]));
  const namesOf = (ids: string[]) =>
    ids.map((id) => nameById.get(id) ?? "?").join(", ") || "none";

  const actor = await getCurrentUser();

  await db.transaction(async (tx) => {
    await tx.delete(ticketLabels).where(eq(ticketLabels.ticketId, ticketId));
    if (nextIds.length > 0) {
      await tx
        .insert(ticketLabels)
        .values(nextIds.map((labelId) => ({ ticketId, labelId })));
    }
    await tx.insert(ticketHistory).values({
      ticketId,
      actorId: actor?.id ?? null,
      field: "labels",
      oldValue: namesOf(currentIds),
      newValue: namesOf(nextIds),
    });
  });

  revalidateTicket(ticketId);
  return { ok: true };
}
