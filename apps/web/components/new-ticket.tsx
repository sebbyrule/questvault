"use client";

// "New ticket" button + modal form. Submits through the createTicket server action.
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { createTicket } from "@/lib/actions";
import type { TicketPriority } from "@/lib/format";

const PRIORITIES: TicketPriority[] = ["p0", "p1", "p2", "p3"];

export function NewTicketButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("p2");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("p2");
    setError("");
  };

  const submit = () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    startTransition(async () => {
      const res = await createTicket({ projectId, title, description, priority });
      if (res?.ok) {
        reset();
        setOpen(false);
      } else {
        setError(res?.error ?? "Something went wrong");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-800"
      >
        + New ticket
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">New ticket</h2>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Description <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Add context, acceptance criteria…"
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Priority</label>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={clsx(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium uppercase transition",
                        priority === p
                          ? "border-brand-400 bg-brand-50 text-brand-600"
                          : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {pending ? "Creating…" : "Create ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
