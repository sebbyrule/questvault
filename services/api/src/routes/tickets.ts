import { Router } from "express";
import { db, eq, and, max } from "@questvault/db";
import { publishEvent, type EventType } from "@questvault/events";
import { tickets } from "@questvault/db/schema";
import {
  createTicketBodySchema,
  updateTicketBodySchema,
} from "@questvault/api-client/schemas";
import { resolveUserId } from "../resolve-user.js";

export const ticketsRouter = Router();

/** Publish a domain event best-effort; never let it break the API response. */
async function emit(type: EventType, payload: Record<string, unknown>, actorId: string | null) {
  try {
    await publishEvent(type, payload, actorId);
  } catch (err) {
    console.error("[api] event publish failed:", err);
  }
}

// GET /api/v1/projects/:projectId/tickets
ticketsRouter.get("/projects/:projectId/tickets", async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { status, assignee_id, sprint_id } = req.query;

    const conditions = [eq(tickets.projectId, projectId)];
    if (status && typeof status === "string") {
      conditions.push(eq(tickets.status, status as never));
    }
    if (assignee_id && typeof assignee_id === "string") {
      conditions.push(eq(tickets.assigneeId, assignee_id));
    }
    if (sprint_id && typeof sprint_id === "string") {
      conditions.push(eq(tickets.sprintId, sprint_id));
    }

    const rows = await db.query.tickets.findMany({
      where: and(...conditions),
      columns: { embedding: false },
      orderBy: (t, { asc }) => [asc(t.rank)],
    });

    res.json({ tickets: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/projects/:projectId/tickets
ticketsRouter.post("/projects/:projectId/tickets", async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const body = createTicketBodySchema.parse(req.body);

    // Resolve a real users.id — req.auth.userId is a label (dev-<email>/
    // mcp-agent), not a UUID, and can't go straight into reporterId.
    const reporterId = await resolveUserId(req.auth!);
    if (!reporterId) {
      res.status(401).json({ error: "Could not resolve an account for this token" });
      return;
    }

    const [maxRow] = await db
      .select({ maxNumber: max(tickets.number) })
      .from(tickets)
      .where(eq(tickets.projectId, projectId));

    const nextNumber = (maxRow?.maxNumber ?? 0) + 1;

    const [created] = await db
      .insert(tickets)
      .values({
        number: nextNumber,
        projectId,
        reporterId,
        title: body.title,
        description: body.description ?? null,
        priority: body.priority,
        assigneeId: body.assigneeId ?? null,
        sprintId: body.sprintId ?? null,
        storyPoints: body.storyPoints ?? null,
        parentId: body.parentId ?? null,
      })
      .returning();

    // Emit so the worker awards XP and dispatches webhooks (parity with web/MCP).
    if (created) {
      await emit(
        "ticket.created",
        {
          id: created.id, number: created.number, title: created.title,
          description: created.description, projectId: created.projectId,
          status: created.status, priority: created.priority,
          reporterId, assigneeId: created.assigneeId,
        },
        reporterId
      );
    }

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/tickets/:ticketId
ticketsRouter.patch("/tickets/:ticketId", async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const body = updateTicketBodySchema.parse(req.body);

    // Read current state first so we can detect transitions (close, PR first-set).
    const current = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: {
        number: true, title: true, projectId: true, status: true,
        priority: true, assigneeId: true, prUrl: true, createdAt: true,
      },
    });
    if (!current) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const now = new Date();
    const updateData: Record<string, unknown> = { ...body, updatedAt: now };
    if (body.status === "done") updateData.closedAt = now;

    const [updated] = await db
      .update(tickets)
      .set(updateData as never)
      .where(eq(tickets.id, ticketId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    // Emit domain events (best-effort) for the worker: XP + webhooks.
    const actorId = await resolveUserId(req.auth!);
    const data = {
      id: updated.id, number: updated.number, title: updated.title,
      projectId: updated.projectId, status: updated.status, priority: updated.priority,
    };
    await emit("ticket.updated", data, actorId);
    if (updated.status === "done" && current.status !== "done") {
      await emit(
        "ticket.closed",
        {
          ...data, assigneeId: updated.assigneeId,
          openedAt: current.createdAt.toISOString(), closedAt: now.toISOString(),
        },
        actorId
      );
    }
    if (body.prUrl && !current.prUrl && actorId) {
      await emit("pr.linked", { ticketId, prUrl: body.prUrl }, actorId);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
