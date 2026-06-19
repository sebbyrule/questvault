"use server";

/**
 * Admin actions for webhook subscriptions: create, toggle active, delete, and
 * send a test ping. Admin-gated via requireAdmin().
 */
import { randomBytes } from "node:crypto";
import { db, eq, dispatchTest, redeliverDelivery, WEBHOOK_EVENTS } from "@questvault/db";
import { webhooks } from "@questvault/db/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "./authz";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  url: z.string().url("Enter a valid URL"),
  events: z.array(z.string()).min(1, "Select at least one event"),
});

export type CreateWebhookInput = z.infer<typeof createSchema>;

const VALID_EVENTS = new Set<string>([...WEBHOOK_EVENTS]);

export async function createWebhook(input: CreateWebhookInput) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Forbidden" };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const events = parsed.data.events.includes("*")
    ? ["*"]
    : parsed.data.events.filter((e) => VALID_EVENTS.has(e));
  if (events.length === 0) return { ok: false as const, error: "Select at least one valid event" };

  await db.insert(webhooks).values({
    name: parsed.data.name,
    url: parsed.data.url,
    secret: randomBytes(24).toString("hex"),
    events,
  });

  revalidatePath("/webhooks");
  return { ok: true as const };
}

export async function setWebhookActive(id: string, active: boolean) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Forbidden" };
  await db.update(webhooks).set({ isActive: active }).where(eq(webhooks.id, id));
  revalidatePath("/webhooks");
  return { ok: true as const };
}

export async function deleteWebhook(id: string) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Forbidden" };
  await db.delete(webhooks).where(eq(webhooks.id, id));
  revalidatePath("/webhooks");
  return { ok: true as const };
}

export async function testWebhook(id: string) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Forbidden" };
  await dispatchTest(db, id);
  revalidatePath("/webhooks");
  return { ok: true as const };
}

/** Re-queue a past delivery; the background worker re-sends it (with a fresh retry budget). */
export async function redeliverWebhook(deliveryId: string) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Forbidden" };
  const ok = await redeliverDelivery(db, deliveryId);
  if (!ok) return { ok: false as const, error: "Delivery not found" };
  revalidatePath("/webhooks");
  return { ok: true as const };
}
