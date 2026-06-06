import { Router } from "express";
import { db, eq, and, max } from "@questvault/db";
import { tickets } from "@questvault/db/schema";
import {
  createTicketBodySchema,
  updateTicketBodySchema,
} from "@questvault/api-client/schemas";

export const ticketsRouter = Router();

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
    const reporterId = req.auth!.userId;

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
        description: body.description,
        priority: body.priority,
        assigneeId: body.assigneeId,
        sprintId: body.sprintId,
        storyPoints: body.storyPoints,
        parentId: body.parentId,
      })
      .returning();

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

    const updateData: Record<string, unknown> = {
      ...body,
      updatedAt: new Date(),
    };

    if (body.status === "done") {
      updateData.closedAt = new Date();
    }

    const [updated] = await db
      .update(tickets)
      .set(updateData as never)
      .where(eq(tickets.id, ticketId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
