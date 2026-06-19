/**
 * QuestVault background worker.
 *
 * The single consumer of the Redis event bus (@questvault/events). It reads
 * domain events published by the web app, the Express API, and the MCP tools,
 * and reacts to them — awarding XP and dispatching webhooks (wired in later
 * increments). This is the home AGENT.md intends for gamification:
 *   "Never award XP inside a request handler. Publish an event; let the
 *    gamification worker consume it."
 *
 * Handlers must be idempotent: the bus is at-least-once.
 */
import "./load-env.js"; // must run before anything that reads env
import {
  consumeEvents,
  createRedis,
  type DomainEvent,
} from "@questvault/events";
import { db, enqueueWebhooks, processDueDeliveries, type WebhookEventType } from "@questvault/db";
import { awardXpForEvent } from "./handlers/xp.js";

let running = true;

/** How often to sweep for due webhook deliveries (retries / manual redeliveries). */
const SWEEP_INTERVAL_MS = 5000;

// Event types that map to an outbound webhook (pr.linked is XP-only).
const WEBHOOK_TYPES = new Set<string>(["ticket.created", "ticket.updated", "ticket.closed", "comment.created"]);

/**
 * Route one event to its side effects. XP awards live here (idempotent, see
 * handlers/xp). Webhook dispatch moves here in the next increment; `ticket.updated`
 * and `comment.created` mint no XP and are no-ops for now.
 */
async function handleEvent(event: DomainEvent): Promise<void> {
  const p = event.payload as Record<string, unknown>;
  let summary: Awaited<ReturnType<typeof awardXpForEvent>> | null = null;

  switch (event.type) {
    case "ticket.created": {
      if (typeof p.reporterId === "string") {
        summary = await awardXpForEvent(event.eventId, {
          userId: p.reporterId,
          action: "ticket_created",
          input: {
            ticketId: p.id,
            title: p.title,
            description: p.description ?? null,
            assigneeId: p.assigneeId ?? null,
          },
          entityId: String(p.id),
          entityType: "ticket",
        });
      }
      break;
    }
    case "ticket.closed": {
      // Credit the assignee if any, else the actor who closed it.
      const earnerId = (p.assigneeId as string | null) ?? event.actorId;
      if (earnerId) {
        summary = await awardXpForEvent(event.eventId, {
          userId: earnerId,
          action: "ticket_closed",
          input: {
            ticketId: p.id,
            priority: p.priority,
            openedAt: p.openedAt ? new Date(p.openedAt as string) : undefined,
            closedAt: p.closedAt ? new Date(p.closedAt as string) : undefined,
          },
          entityId: String(p.id),
          entityType: "ticket",
        });
      }
      break;
    }
    case "pr.linked": {
      if (event.actorId) {
        summary = await awardXpForEvent(event.eventId, {
          userId: event.actorId,
          action: "pr_linked",
          input: { ticketId: p.ticketId, prUrl: p.prUrl },
          entityId: String(p.ticketId),
          entityType: "pr",
        });
      }
      break;
    }
    default:
      break; // ticket.updated / comment.created mint no XP (webhook-only)
  }

  // Fan the event out to subscribed webhooks (off the request path), then nudge
  // the sweep so delivery is prompt rather than waiting for the next tick.
  if (WEBHOOK_TYPES.has(event.type)) {
    const n = await enqueueWebhooks(db, { type: event.type as WebhookEventType, data: p });
    if (n > 0) await processDueDeliveries(db);
  }

  const tail = summary
    ? summary.skipped
      ? "skipped (already processed)"
      : `+${summary.xpAwarded} XP${summary.badges.length ? ` badges=[${summary.badges.join(",")}]` : ""}`
    : "no-op";
  console.log(`[worker] ${event.type} (${event.eventId}) actor=${event.actorId ?? "system"} → ${tail}`);
}

async function main(): Promise<void> {
  // maxRetriesPerRequest: null is required for blocking XREADGROUP reads.
  const redis = createRedis({ maxRetriesPerRequest: null });
  console.log("[worker] QuestVault worker starting; consuming event bus…");

  const shutdown = (sig: string) => {
    console.log(`[worker] ${sig} received, shutting down…`);
    running = false;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Periodic sweep: deliver due webhook deliveries (backoff retries + manual
  // redeliveries enqueued by the admin UI). On-event delivery is nudged inline.
  const sweep = setInterval(() => {
    void processDueDeliveries(db);
  }, SWEEP_INTERVAL_MS);

  await consumeEvents(redis, handleEvent, { isRunning: () => running });

  clearInterval(sweep);
  await redis.quit().catch(() => {});
  console.log("[worker] stopped.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
