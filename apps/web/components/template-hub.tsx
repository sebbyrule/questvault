"use client";

// Template Hub: create a project from a template (built-in preset or saved), and
// save an existing project's structure as a new template.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { createProjectFromTemplate, saveProjectAsTemplate } from "@/lib/template-actions";

type BuiltinCard = {
  key: string;
  name: string;
  description: string;
  iconEmoji: string;
  color: string;
  labelCount: number;
  ticketCount: number;
  hasSprint: boolean;
};
type SavedCard = {
  id: string;
  name: string;
  description: string | null;
  iconEmoji: string | null;
  color: string | null;
  labelCount: number;
  ticketCount: number;
};
type ProjectOpt = { id: string; name: string };

type Ref = { type: "builtin"; key: string } | { type: "saved"; id: string };
type UseTarget = { ref: Ref; name: string; iconEmoji: string; color: string };

export function TemplateHub({
  builtins,
  saved,
  projects,
}: {
  builtins: BuiltinCard[];
  saved: SavedCard[];
  projects: ProjectOpt[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<UseTarget | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Start a project with labels, a sprint, and starter tickets already in place.
        </p>
      </header>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Built-in presets</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {builtins.map((b) => (
          <TemplateCard
            key={b.key}
            name={b.name}
            description={b.description}
            iconEmoji={b.iconEmoji}
            color={b.color}
            labelCount={b.labelCount}
            ticketCount={b.ticketCount}
            hasSprint={b.hasSprint}
            onUse={() =>
              setTarget({ ref: { type: "builtin", key: b.key }, name: b.name, iconEmoji: b.iconEmoji, color: b.color })
            }
          />
        ))}
      </div>

      {saved.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-700">Saved templates</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((s) => (
              <TemplateCard
                key={s.id}
                name={s.name}
                description={s.description ?? ""}
                iconEmoji={s.iconEmoji ?? "📋"}
                color={s.color ?? "#534AB7"}
                labelCount={s.labelCount}
                ticketCount={s.ticketCount}
                onUse={() =>
                  setTarget({
                    ref: { type: "saved", id: s.id },
                    name: s.name.replace(/ Template$/, ""),
                    iconEmoji: s.iconEmoji ?? "📋",
                    color: s.color ?? "#534AB7",
                  })
                }
              />
            ))}
          </div>
        </>
      )}

      <SaveAsTemplate projects={projects} onSaved={() => router.refresh()} />

      {target && (
        <UseTemplateModal
          target={target}
          onClose={() => setTarget(null)}
          onCreated={(slug) => {
            setTarget(null);
            router.push(`/board?project=${slug}`);
          }}
        />
      )}
    </div>
  );
}

function TemplateCard({
  name,
  description,
  iconEmoji,
  color,
  labelCount,
  ticketCount,
  hasSprint,
  onUse,
}: {
  name: string;
  description: string;
  iconEmoji: string;
  color: string;
  labelCount: number;
  ticketCount: number;
  hasSprint?: boolean;
  onUse: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
          style={{ backgroundColor: color + "1A" }}
        >
          {iconEmoji}
        </span>
        <p className="font-semibold text-gray-900">{name}</p>
      </div>
      {description && <p className="mt-3 line-clamp-2 text-sm text-gray-500">{description}</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-400">
        <span>{labelCount} labels</span>
        <span>·</span>
        <span>{ticketCount} tickets</span>
        {hasSprint && (
          <>
            <span>·</span>
            <span>1 sprint</span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onUse}
        className="mt-4 self-start rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-800"
      >
        Use template
      </button>
    </div>
  );
}

function UseTemplateModal({
  target,
  onClose,
  onCreated,
}: {
  target: UseTarget;
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const [name, setName] = useState(target.name);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    startTransition(async () => {
      const res = await createProjectFromTemplate({ ref: target.ref, name });
      if (res?.ok) onCreated(res.slug);
      else setError(res?.error ?? "Something went wrong");
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
      onClick={() => !pending && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
            style={{ backgroundColor: target.color + "1A" }}
          >
            {target.iconEmoji}
          </span>
          <h2 className="text-lg font-semibold text-gray-900">New project from template</h2>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">Project name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
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
  );
}

function SaveAsTemplate({
  projects,
  onSaved,
}: {
  projects: ProjectOpt[];
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (projects.length === 0) return null;

  const submit = () => {
    if (!projectId) return;
    setStatus("idle");
    startTransition(async () => {
      const res = await saveProjectAsTemplate({ projectId });
      if (res?.ok) {
        setStatus("saved");
        onSaved();
      } else {
        setStatus("error");
        setError(res?.error ?? "Failed to save");
      }
    });
  };

  return (
    <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-700">Save a project as a template</h2>
      <p className="mt-0.5 text-xs text-gray-400">
        Captures the project&apos;s labels, active sprint, and open tickets for reuse.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save as template"}
        </button>
        {status === "saved" && <span className="text-sm text-teal-600">Saved ✓</span>}
        {status === "error" && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}
