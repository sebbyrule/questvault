"use client";

/**
 * Admin Webhooks page: create event subscriptions, toggle/delete them, send a
 * test ping, and view a recent-deliveries log. Each delivery is HMAC-signed
 * (X-QuestVault-Signature) with the webhook's secret (shown here).
 */
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import {
  createWebhook,
  setWebhookActive,
  deleteWebhook,
  testWebhook,
} from "@/lib/webhook-actions";
import type { WebhookRow, DeliveryRow } from "@/lib/queries";

export function WebhooksManager({
  hooks,
  deliveries,
  eventTypes,
}: {
  hooks: WebhookRow[];
  deliveries: DeliveryRow[];
  eventTypes: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(eventTypes));

  function toggleEvent(e: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(e) ? next.delete(e) : next.add(e);
      return next;
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
    });
  }

  function submit() {
    setError(null);
    if (!name.trim() || !url.trim()) {
      setError("Name and URL are required.");
      return;
    }
    startTransition(async () => {
      const res = await createWebhook({ name, url, events: Array.from(selected) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setUrl("");
      setSelected(new Set(eventTypes));
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          POST event callbacks to external systems. Each delivery is signed with{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">X-QuestVault-Signature: sha256=…</code>.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Create */}
      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-700">Add a webhook</h2>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="CI pipeline"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="flex-[2] min-w-[220px]">
              <label className="mb-1 block text-xs font-medium text-gray-500">Payload URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/hooks/questvault"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Events</label>
            <div className="flex flex-wrap gap-3">
              {eventTypes.map((e) => (
                <label key={e} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input type="checkbox" checked={selected.has(e)} onChange={() => toggleEvent(e)} />
                  <span className="font-mono text-xs">{e}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            Add webhook
          </button>
        </div>
      </section>

      {/* List */}
      <section className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Webhooks <span className="text-gray-400">({hooks.length})</span>
          </h2>
        </div>
        {hooks.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No webhooks yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {hooks.map((h) => (
              <li key={h.id} className="px-6 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-800">{h.name}</p>
                      {!h.isActive && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
                          paused
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-gray-400">{h.url}</p>
                    <p className="truncate text-xs text-gray-400">
                      {h.events.includes("*") ? "all events" : h.events.join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => testWebhook(h.id))}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40"
                    >
                      Send test
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setWebhookActive(h.id, !h.isActive))}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    >
                      {h.isActive ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => deleteWebhook(h.id))}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 truncate text-[11px] text-gray-400">
                  secret <code className="font-mono text-gray-500">{h.secret}</code>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Deliveries */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-700">Recent deliveries</h2>
        </div>
        {deliveries.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No deliveries yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {deliveries.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-6 py-2.5 text-sm">
                <span
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    d.status === "success" ? "bg-teal-50 text-teal-600" : "bg-red-50 text-red-600"
                  )}
                >
                  {d.status}
                </span>
                <span className="font-mono text-xs text-gray-600">{d.eventType}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
                  {d.webhookName ?? "—"}
                  {d.responseStatus != null && ` · HTTP ${d.responseStatus}`}
                  {d.error && ` · ${d.error}`}
                </span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {d.createdAt.toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
