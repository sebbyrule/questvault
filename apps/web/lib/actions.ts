"use server";

/**
 * Server actions for ticket mutations. These run on the server and write
 * through @questvault/db, then revalidate the affected pages.
 *
 * NOTE: auth is not yet wired into the web app, so the reporter for created
 * tickets defaults to the first seeded user. Replace with the session user
 * once Auth.js is mounted.
 */
import { db, eq, max, and } from "@questvault/db";
import { tickets } from "@questvault/db/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDefaultReporterId } from "./queries";

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

  const set: Record<string, unknown> = {
    status: parsed.data,
    updatedAt: new Date(),
  };
  set.closedAt = parsed.data === "done" ? new Date() : null;

  await db.update(tickets).set(set).where(eq(tickets.id, ticketId));

  revalidatePath("/board");
  revalidatePath("/dashboard");
  return { ok: true };
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

  const reporterId = await getDefaultReporterId();
  if (!reporterId) return { ok: false, error: "No users exist to report the ticket" };

  // Next per-project ticket number. (Single-writer dev path; the
  // unique (project_id, number) constraint guards against collisions.)
  const [row] = await db
    .select({ maxNumber: max(tickets.number) })
    .from(tickets)
    .where(eq(tickets.projectId, projectId));
  const number = (row?.maxNumber ?? 0) + 1;

  await db.insert(tickets).values({
    number,
    projectId,
    reporterId,
    title,
    description,
    priority,
    status: "backlog",
  });

  revalidatePath("/board");
  revalidatePath("/dashboard");
  return { ok: true };
}
