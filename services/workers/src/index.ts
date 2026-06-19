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

let running = true;

/** Route one event to its side effects. Increment 1: log-only. */
async function handleEvent(event: DomainEvent): Promise<void> {
  console.log(
    `[worker] ${event.type} (${event.eventId}) actor=${event.actorId ?? "system"}`,
    event.payload
  );
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

  await consumeEvents(redis, handleEvent, { isRunning: () => running });

  await redis.quit().catch(() => {});
  console.log("[worker] stopped.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
