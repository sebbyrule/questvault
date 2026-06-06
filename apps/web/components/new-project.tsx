"use client";

// "New project" button + modal form. Submits through the createProject server
// action; on success the projects grid is revalidated.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { createProject } from "@/lib/actions";

const EMOJIS = ["📋", "⚔️", "🚀", "🛠️", "🎯", "🧩", "🌱", "🔮", "📦", "🐛"];
const COLORS = [
  "#534AB7", // brand
  "#0D9488", // teal
  "#F59E0B", // amber
  "#0284C7", // sky
  "#E11D48", // rose
  "#7C3AED", // violet
];

export function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconEmoji, setIconEmoji] = useState(EMOJIS[0]!);
  const [color, setColor] = useState(COLORS[0]!);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setName("");
    setDescription("");
    setIconEmoji(EMOJIS[0]!);
    setColor(COLORS[0]!);
    setError("");
  };

  const close = () => {
    if (pending) return;
    setOpen(false);
  };

  const submit = () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    startTransition(async () => {
      const res = await createProject({ name, description, iconEmoji, color });
      if (res?.ok) {
        reset();
        setOpen(false);
        router.refresh();
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
        + New project
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
                style={{ backgroundColor: color + "1A" }}
              >
                {iconEmoji}
              </span>
              <h2 className="text-lg font-semibold text-gray-900">New project</h2>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mobile App"
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
                  rows={2}
                  placeholder="What is this project about?"
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setIconEmoji(e)}
                      className={clsx(
                        "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition",
                        iconEmoji === e
                          ? "border-brand-400 bg-brand-50"
                          : "border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Color ${c}`}
                      className={clsx(
                        "h-7 w-7 rounded-full ring-2 ring-offset-2 transition",
                        color === c ? "ring-gray-400" : "ring-transparent"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
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
                {pending ? "Creating…" : "Create project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
