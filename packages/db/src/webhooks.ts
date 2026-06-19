/**
 * Webhook dispatch — HMAC-signed POSTs to subscribed URLs with a per-delivery
 * record and exponential-backoff retry. signPayload/isEventSubscribed/backoffMs
 * are pure (no DB); the dispatch/sweep functions take the db handle as a param
 * (type-only import) so this module stays pure-importable for tests.
 *
 * Delivery model: `enqueueWebhooks` fans an event out to a `pending`
 * webhook_deliveries row per subscribed webhook (storing the payload). The
 * background worker drives delivery via `processDueDeliveries` (an on-event
 * nudge + a periodic sweep), retrying failures with backoff up to MAX_ATTEMPTS.
 * Mutations no longer dispatch inline — they publish a domain event and the
 * worker enqueues from it.
 */
import { createHmac } from "node:crypto";
import { and, eq, lte, inArray } from "drizzle-orm";
import type { Database } from "./client";
import { webhooks, webhookDeliveries } from "./schema/webhooks";

export const WEBHOOK_EVENTS = [
  "ticket.created",
  "ticket.updated",
  "ticket.closed",
  "comment.created",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number] | "ping";

export type WebhookEvent = { type: WebhookEventType; data: Record<string, unknown> };

/** Max delivery attempts before a delivery is marked permanently failed. */
export const MAX_ATTEMPTS = 5;
const TIMEOUT_MS = 5000;

/** HMAC-SHA256 of the raw body with the webhook secret (hex). Pure. */
export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Whether a subscription list covers an event type (["*"] = all). Pure. */
export function isEventSubscribed(events: string[], type: string): boolean {
  return events.includes("*") || events.includes(type);
}

/** Backoff before attempt N (1-based): 30s, 60s, 120s, … capped at 30m. Pure. */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 30 * 60_000);
}

/**
 * Fan an event out to a `pending` delivery row per active subscribed webhook.
 * Does not send — the worker's sweep delivers. Best-effort: never throws.
 * Returns the number of deliveries enqueued.
 */
export async function enqueueWebhooks(db: Database, event: WebhookEvent): Promise<number> {
  try {
    const hooks = await db.select().from(webhooks).where(eq(webhooks.isActive, true));
    const targets = hooks.filter((h) => isEventSubscribed(h.events, event.type));
    if (targets.length === 0) return 0;
    await db.insert(webhookDeliveries).values(
      targets.map((h) => ({
        webhookId: h.id,
        eventType: event.type,
        status: "pending",
        payload: event.data,
        attempts: 0,
        nextAttemptAt: new Date(),
      }))
    );
    return targets.length;
  } catch (err) {
    console.error("[webhooks] enqueue failed:", err);
    return 0;
  }
}

type DeliveryRow = typeof webhookDeliveries.$inferSelect;
type HookRow = typeof webhooks.$inferSelect;

/**
 * Attempt one delivery and update its row. Never throws. On failure, schedules
 * the next attempt (backoff) until MAX_ATTEMPTS, then marks it `failed`.
 */
async function attemptDelivery(db: Database, delivery: DeliveryRow, hook: HookRow): Promise<void> {
  const body = JSON.stringify({
    id: delivery.id,
    type: delivery.eventType,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.payload ?? {},
  });
  const signature = signPayload(hook.secret, body);
  const start = Date.now();
  const attempts = delivery.attempts + 1;

  let ok = false;
  let responseStatus: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QuestVault-Event": delivery.eventType,
        "X-QuestVault-Signature": `sha256=${signature}`,
        "X-QuestVault-Delivery": delivery.id,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    responseStatus = res.status;
    ok = res.ok;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : "delivery failed";
  }

  const exhausted = !ok && attempts >= MAX_ATTEMPTS;
  const status = ok ? "success" : exhausted ? "failed" : "pending";
  try {
    await db
      .update(webhookDeliveries)
      .set({
        status,
        attempts,
        responseStatus,
        error,
        durationMs: Date.now() - start,
        nextAttemptAt: status === "pending" ? new Date(Date.now() + backoffMs(attempts)) : null,
        updatedAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, delivery.id));
  } catch (logErr) {
    console.error("[webhooks] delivery update failed:", logErr);
  }
}

/**
 * Deliver all `pending` deliveries that are due (nextAttemptAt <= now) for
 * active webhooks. Called by the worker on each event and on a periodic sweep.
 * Best-effort: never throws. Returns the number of deliveries attempted.
 */
export async function processDueDeliveries(db: Database, limit = 50): Promise<number> {
  try {
    const due = await db
      .select({ d: webhookDeliveries, h: webhooks })
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhookDeliveries.webhookId, webhooks.id))
      .where(
        and(
          eq(webhookDeliveries.status, "pending"),
          lte(webhookDeliveries.nextAttemptAt, new Date()),
          eq(webhooks.isActive, true)
        )
      )
      .limit(limit);
    if (due.length === 0) return 0;
    await Promise.allSettled(due.map(({ d, h }) => attemptDelivery(db, d, h)));
    return due.length;
  } catch (err) {
    console.error("[webhooks] sweep failed:", err);
    return 0;
  }
}

/**
 * Queue a synthetic ping for one webhook and attempt it once immediately (used
 * by the admin "Send test"). Returns false if the webhook doesn't exist.
 */
export async function dispatchTest(db: Database, webhookId: string): Promise<boolean> {
  const [hook] = await db.select().from(webhooks).where(eq(webhooks.id, webhookId)).limit(1);
  if (!hook) return false;
  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      webhookId: hook.id,
      eventType: "ping",
      status: "pending",
      payload: { message: "QuestVault test event" },
      attempts: 0,
      nextAttemptAt: new Date(),
    })
    .returning();
  if (delivery) await attemptDelivery(db, delivery, hook);
  return true;
}

/**
 * Manually re-queue a delivery: reset it to `pending` with a fresh retry budget,
 * due now. The worker's sweep picks it up. Returns false if it doesn't exist.
 */
export async function redeliverDelivery(db: Database, deliveryId: string): Promise<boolean> {
  const updated = await db
    .update(webhookDeliveries)
    .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), error: null, updatedAt: new Date() })
    .where(inArray(webhookDeliveries.id, [deliveryId]))
    .returning({ id: webhookDeliveries.id });
  return updated.length > 0;
}
