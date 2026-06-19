import type Redis from "ioredis";
import { CONSUMER_GROUP, STREAM_KEY } from "./redis";
import type { DomainEvent } from "./types";

/** A consumer handles one event. It should be idempotent and best-effort:
 *  throwing causes the event to remain pending and be redelivered on restart. */
export type EventHandler = (event: DomainEvent) => Promise<void>;

export interface ConsumeOptions {
  /** Logical consumer name within the group (defaults to the hostname/pid). */
  consumerName?: string;
  /** Max events per read batch. */
  count?: number;
  /** Block this many ms waiting for new events. */
  blockMs?: number;
  /** Returns false to stop the loop (used by tests / shutdown). */
  isRunning?: () => boolean;
}

/** Ensure the consumer group exists (idempotent; MKSTREAM creates the stream). */
async function ensureGroup(redis: Redis): Promise<void> {
  try {
    await redis.xgroup("CREATE", STREAM_KEY, CONSUMER_GROUP, "$", "MKSTREAM");
  } catch (err) {
    // BUSYGROUP = group already exists; any other error is real.
    if (!(err instanceof Error && err.message.includes("BUSYGROUP"))) throw err;
  }
}

/** Parse one stream entry's flat `[field, value, ...]` array into a DomainEvent. */
function parseEntry(fields: string[]): DomainEvent | null {
  for (let i = 0; i < fields.length - 1; i += 2) {
    if (fields[i] === "data") {
      try {
        return JSON.parse(fields[i + 1]!) as DomainEvent;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ioredis returns XREADGROUP results as a loosely-typed nested array.
type StreamReply = Array<[stream: string, entries: Array<[id: string, fields: string[]]>]>;

/**
 * Consume the event stream under the worker consumer group, invoking `handler`
 * for each event and XACKing on success. Reads any pending (previously
 * delivered-but-unacked, e.g. from a crash) entries first, then blocks for new
 * ones. Runs until `isRunning()` returns false.
 *
 * At-least-once: a handler that throws (or a crash before XACK) leaves the entry
 * pending, so it is redelivered — handlers MUST be idempotent.
 */
export async function consumeEvents(
  redis: Redis,
  handler: EventHandler,
  opts: ConsumeOptions = {}
): Promise<void> {
  const consumer = opts.consumerName ?? `${process.pid}@worker`;
  const count = opts.count ?? 10;
  const blockMs = opts.blockMs ?? 5000;
  const isRunning = opts.isRunning ?? (() => true);

  await ensureGroup(redis);

  // Start by draining this consumer's pending list ("0"); switch to new-only
  // (">") once it is empty.
  let cursor = "0";

  while (isRunning()) {
    let reply: StreamReply | null;
    try {
      reply = (await redis.xreadgroup(
        "GROUP", CONSUMER_GROUP, consumer,
        "COUNT", count,
        "BLOCK", blockMs,
        "STREAMS", STREAM_KEY, cursor
      )) as StreamReply | null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The group/stream was dropped out from under us (e.g. FLUSHDB / DEL in
      // dev) — recreate it and resume from the pending scan.
      if (msg.includes("NOGROUP")) {
        await ensureGroup(redis).catch(() => {});
        cursor = "0";
        continue;
      }
      console.error("[events] read failed; retrying:", msg);
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    const entries = reply?.[0]?.[1] ?? [];
    // Pending drained → switch to live tail.
    if (cursor === "0" && entries.length === 0) {
      cursor = ">";
      continue;
    }

    for (const [id, fields] of entries) {
      const event = parseEntry(fields);
      if (!event) {
        // Unparseable entry: ack it so it doesn't wedge the consumer forever.
        console.error(`[events] dropping unparseable entry ${id}`);
        await redis.xack(STREAM_KEY, CONSUMER_GROUP, id).catch(() => {});
        continue;
      }
      try {
        await handler(event);
        await redis.xack(STREAM_KEY, CONSUMER_GROUP, id);
      } catch (err) {
        // Leave unacked → redelivered on the next pending scan / restart.
        console.error(
          `[events] handler failed for ${event.type} (${event.eventId}); will retry:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }
}
