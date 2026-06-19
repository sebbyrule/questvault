import Redis, { type RedisOptions } from "ioredis";

/** The single stream all domain events are appended to. */
export const STREAM_KEY = "questvault:events";
/** The consumer group the worker pool reads under. */
export const CONSUMER_GROUP = "questvault-workers";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * Create an ioredis connection. Callers pick a profile via `opts`:
 *  - publisher: `maxRetriesPerRequest: 1` so a command fails fast when Redis is
 *    down (best-effort publish) instead of buffering forever — but the offline
 *    queue (default on) still holds it briefly until the connection is `ready`,
 *    so the first publish after boot isn't dropped.
 *  - consumer (the worker): `maxRetriesPerRequest: null`, required for the
 *    blocking XREADGROUP reads.
 */
export function createRedis(opts: RedisOptions = {}): Redis {
  const client = new Redis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 5000,
    ...opts,
  });
  // Swallow connection errors at the socket level; callers decide what a failed
  // command means (publish is best-effort; the worker logs + retries its loop).
  client.on("error", () => {});
  return client;
}
