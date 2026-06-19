import type Redis from "ioredis";
import { createRedis, STREAM_KEY } from "./redis";
import { makeEvent, type DomainEvent, type EventType } from "./types";

// Lazily-created singleton publisher connection, shared across a process.
let publisher: Redis | null = null;
let warnedDown = false;

function getPublisher(): Redis {
  if (!publisher) {
    // Fail a publish fast when Redis is down (best-effort), but let the offline
    // queue hold the command until the connection is ready so the first publish
    // after boot isn't dropped.
    publisher = createRedis({ maxRetriesPerRequest: 1 });
  }
  return publisher;
}

/**
 * Publish a domain event to the bus. **Best-effort** — mirrors the webhook
 * dispatch contract: a Redis outage logs once and resolves, it never throws
 * into (or rolls back) the caller's mutation. Returns the published event on
 * success, or `null` when the publish failed.
 *
 * The event is stored as a single `data` field (JSON) on the stream entry.
 */
export async function publishEvent<P extends Record<string, unknown>>(
  type: EventType,
  payload: P,
  actorId: string | null
): Promise<DomainEvent<P> | null> {
  const event = makeEvent(type, payload, actorId);
  try {
    await getPublisher().xadd(STREAM_KEY, "*", "data", JSON.stringify(event));
    warnedDown = false;
    return event;
  } catch (err) {
    if (!warnedDown) {
      warnedDown = true;
      console.error(
        `[events] publish failed (${type}); event bus unavailable, continuing:`,
        err instanceof Error ? err.message : err
      );
    }
    return null;
  }
}

/** Close the shared publisher (tests / graceful shutdown). */
export async function closePublisher(): Promise<void> {
  if (publisher) {
    await publisher.quit().catch(() => {});
    publisher = null;
  }
}
