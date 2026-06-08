"use server";

/**
 * Server actions for the Template Hub: create a project from a template (built-in
 * preset or saved), and save an existing project's structure as a new template.
 */
import { db, eq, and, ne, inArray } from "@questvault/db";
import {
  projects,
  projectMembers,
  labels,
  sprints,
  tickets,
  ticketLabels,
  projectTemplates,
  type TemplateDefinition,
} from "@questvault/db/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "./queries";
import { uniqueProjectSlug } from "./slug";
import { getBuiltinTemplate } from "./templates";

// ─── Apply a template → new project ─────────────────────────────────────────

const refSchema = z.union([
  z.object({ type: z.literal("builtin"), key: z.string().max(100) }),
  z.object({ type: z.literal("saved"), id: z.string().uuid() }),
]);
const createFromTemplateSchema = z.object({
  ref: refSchema,
  name: z.string().trim().min(1, "Name is required").max(100),
});

export type CreateFromTemplateInput = z.input<typeof createFromTemplateSchema>;

type ResolvedTemplate = {
  description: string | null;
  iconEmoji: string | null;
  color: string | null;
  definition: TemplateDefinition;
};

async function resolveTemplate(
  ref: z.infer<typeof refSchema>
): Promise<ResolvedTemplate | null> {
  if (ref.type === "builtin") {
    const b = getBuiltinTemplate(ref.key);
    return b
      ? { description: b.description, iconEmoji: b.iconEmoji, color: b.color, definition: b.definition }
      : null;
  }
  const row = await db.query.projectTemplates.findFirst({
    where: eq(projectTemplates.id, ref.id),
  });
  return row
    ? { description: row.description, iconEmoji: row.iconEmoji, color: row.color, definition: row.definition }
    : null;
}

export async function createProjectFromTemplate(input: CreateFromTemplateInput) {
  const parsed = createFromTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { ref, name } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const tpl = await resolveTemplate(ref);
  if (!tpl) return { ok: false as const, error: "Template not found" };

  const slug = await uniqueProjectSlug(name);
  const def = tpl.definition;

  const project = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(projects)
      .values({
        name,
        slug,
        description: tpl.description,
        iconEmoji: tpl.iconEmoji,
        color: tpl.color,
      })
      .returning();
    if (!created) throw new Error("Failed to create project");

    await tx
      .insert(projectMembers)
      .values({ projectId: created.id, userId: user.id, role: "owner" });

    // Labels (name → id map for ticket attachment).
    const labelIdByName = new Map<string, string>();
    if (def.labels.length > 0) {
      const inserted = await tx
        .insert(labels)
        .values(def.labels.map((l) => ({ projectId: created.id, name: l.name, color: l.color })))
        .returning({ id: labels.id, name: labels.name });
      for (const r of inserted) labelIdByName.set(r.name, r.id);
    }

    // Optional initial sprint (active).
    let sprintId: string | null = null;
    if (def.sprint) {
      const [s] = await tx
        .insert(sprints)
        .values({
          projectId: created.id,
          name: def.sprint.name,
          goal: def.sprint.goal ?? null,
          status: "active",
          startDate: new Date(),
        })
        .returning({ id: sprints.id });
      sprintId = s?.id ?? null;
    }

    // Starter tickets (sequential numbers; reporter = current user).
    for (let i = 0; i < def.tickets.length; i++) {
      const t = def.tickets[i]!;
      const [row] = await tx
        .insert(tickets)
        .values({
          number: i + 1,
          projectId: created.id,
          reporterId: user.id,
          title: t.title,
          description: t.description ?? null,
          priority: t.priority,
          storyPoints: t.storyPoints ?? null,
          sprintId,
        })
        .returning({ id: tickets.id });
      if (row && t.labels && t.labels.length > 0) {
        const ids = t.labels
          .map((n) => labelIdByName.get(n))
          .filter((x): x is string => !!x);
        if (ids.length > 0) {
          await tx.insert(ticketLabels).values(ids.map((labelId) => ({ ticketId: row.id, labelId })));
        }
      }
    }

    return created;
  });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true as const, projectId: project.id, slug: project.slug };
}

// ─── Save an existing project → new template ────────────────────────────────

const saveSchema = z.object({ projectId: z.string().uuid() });

export async function saveProjectAsTemplate(input: { projectId: string }) {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid project" };
  const { projectId } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return { ok: false as const, error: "Project not found" };

  const labelRows = await db
    .select({ name: labels.name, color: labels.color })
    .from(labels)
    .where(eq(labels.projectId, projectId));

  const activeSprint = await db.query.sprints.findFirst({
    where: and(eq(sprints.projectId, projectId), eq(sprints.status, "active")),
    columns: { name: true, goal: true },
  });

  const ticketRows = await db.query.tickets.findMany({
    where: and(eq(tickets.projectId, projectId), ne(tickets.status, "archived")),
    columns: { id: true, title: true, description: true, priority: true, storyPoints: true },
    orderBy: (t, { asc }) => [asc(t.rank)],
  });

  // Label names per ticket.
  const labelsByTicket = new Map<string, string[]>();
  if (ticketRows.length > 0) {
    const tlRows = await db
      .select({ ticketId: ticketLabels.ticketId, name: labels.name })
      .from(ticketLabels)
      .innerJoin(labels, eq(ticketLabels.labelId, labels.id))
      .where(inArray(ticketLabels.ticketId, ticketRows.map((r) => r.id)));
    for (const r of tlRows) {
      const arr = labelsByTicket.get(r.ticketId) ?? [];
      arr.push(r.name);
      labelsByTicket.set(r.ticketId, arr);
    }
  }

  const definition: TemplateDefinition = {
    labels: labelRows,
    ...(activeSprint
      ? { sprint: { name: activeSprint.name, ...(activeSprint.goal ? { goal: activeSprint.goal } : {}) } }
      : {}),
    tickets: ticketRows.map((t) => ({
      title: t.title,
      ...(t.description ? { description: t.description } : {}),
      priority: t.priority,
      ...(t.storyPoints != null ? { storyPoints: t.storyPoints } : {}),
      ...(labelsByTicket.get(t.id) ? { labels: labelsByTicket.get(t.id) } : {}),
    })),
  };

  await db.insert(projectTemplates).values({
    name: `${project.name} Template`,
    description: project.description,
    iconEmoji: project.iconEmoji,
    color: project.color,
    definition,
    sourceProjectId: projectId,
    createdBy: user.id,
  });

  revalidatePath("/templates");
  return { ok: true as const };
}
