/**
 * Webhook dispatch — best-effort, HMAC-signed POSTs to subscribed URLs, with a
 * per-attempt delivery log. signPayload/isEventSubscribed are pure (no DB);
 * dispatchWebhooks takes the db handle as a param (type-only import) so this
 * module stays pure-importable for tests.
 */
import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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

/** HMAC-SHA256 of the raw body with the webhook secret (hex). Pure. */
export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Whether a subscription list covers an event type (["*"] = all). Pure. */
export function isEventSubscribed(events: string[], type: string): boolean {
  return events.includes("*") || events.includes(type);
}

const TIMEOUT_MS = 5000;

/** Deliver one event to one webhook and log the attempt. Never throws. */
async function deliver(
  db: Database,
  hook: { id: string; url: string; secret: string },
  event: WebhookEvent
): Promise<void> {
  const body = JSON.stringify({
    id: randomUUID(),
    type: event.type,
    createdAt: new Date().toISOString(),
    data: event.data,
  });
  const signature = signPayload(hook.secret, body);
  const start = Date.now();

  let status = "failed";
  let responseStatus: number | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QuestVault-Event": event.type,
        "X-QuestVault-Signature": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    responseStatus = res.status;
    status = res.ok ? "success" : "failed";
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : "delivery failed";
  } finally {
    try {
      await db.insert(webhookDeliveries).values({
        webhookId: hook.id,
        eventType: event.type,
        status,
        responseStatus,
        error,
        durationMs: Date.now() - start,
      });
    } catch (logErr) {
      console.error("[webhooks] delivery log failed:", logErr);
    }
  }
}

/**
 * Fan out an event to every active webhook subscribed to its type. Best-effort:
 * awaits all deliveries but never throws into the caller.
 */
export async function dispatchWebhooks(db: Database, event: WebhookEvent): Promise<void> {
  try {
    const hooks = await db.select().from(webhooks).where(eq(webhooks.isActive, true));
    const targets = hooks.filter((h) => isEventSubscribed(h.events, event.type));
    if (targets.length === 0) return;
    await Promise.allSettled(targets.map((h) => deliver(db, h, event)));
  } catch (err) {
    console.error("[webhooks] dispatch failed:", err);
  }
}

/** Deliver a synthetic ping to a single webhook (used by the admin "Send test"). */
export async function dispatchTest(db: Database, webhookId: string): Promise<boolean> {
  const [hook] = await db.select().from(webhooks).where(eq(webhooks.id, webhookId)).limit(1);
  if (!hook) return false;
  await deliver(db, hook, { type: "ping", data: { message: "QuestVault test event" } });
  return true;
}
