import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WEBHOOK_EVENTS } from "@questvault/db";
import { requireAdmin } from "@/lib/authz";
import { listWebhooks, listRecentDeliveries } from "@/lib/queries";
import { WebhooksManager } from "@/components/webhooks/webhooks-manager";

export const metadata: Metadata = { title: "Webhooks" };
export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  if (!(await requireAdmin())) redirect("/dashboard");

  const [hooks, deliveries] = await Promise.all([listWebhooks(), listRecentDeliveries()]);

  return (
    <WebhooksManager hooks={hooks} deliveries={deliveries} eventTypes={[...WEBHOOK_EVENTS]} />
  );
}
