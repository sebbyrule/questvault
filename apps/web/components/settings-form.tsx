"use client";

// Workspace settings form. Writes through the saveSettings server action.
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { saveSettings } from "@/lib/settings-actions";

type ToolInfo = { name: string; description: string };
type Initial = {
  llmProvider: string;
  llmModel: string;
  llmBaseUrl: string;
  apiKeySet: boolean;
  skillsMd: string;
  workingDir: string;
  enabledTools: string[] | null;
};

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400";

export function SettingsForm({
  tools,
  initial,
}: {
  tools: ToolInfo[];
  initial: Initial;
}) {
  const [llmProvider, setLlmProvider] = useState(initial.llmProvider);
  const [llmModel, setLlmModel] = useState(initial.llmModel);
  const [llmBaseUrl, setLlmBaseUrl] = useState(initial.llmBaseUrl);
  const [llmApiKey, setLlmApiKey] = useState("");
  const [skillsMd, setSkillsMd] = useState(initial.skillsMd);
  const [workingDir, setWorkingDir] = useState(initial.workingDir);
  // null → all tools enabled.
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(initial.enabledTools ?? tools.map((t) => t.name))
  );

  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const toggleTool = (name: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const submit = () => {
    setStatus("idle");
    startTransition(async () => {
      const res = await saveSettings({
        llmProvider,
        llmModel,
        llmBaseUrl,
        llmApiKey,
        skillsMd,
        workingDir,
        enabledTools: Array.from(enabled),
      });
      if (res.ok) {
        setStatus("saved");
        setLlmApiKey(""); // clear the write-only field
      } else {
        setStatus("error");
        setError(res.error ?? "Failed to save");
      }
    });
  };

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Workspace configuration. Blank fields fall back to environment defaults.
        </p>
      </header>

      <div className="space-y-8">
        {/* LLM integration */}
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700">LLM integration</h2>

          <Field label="Provider">
            <select
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value)}
              className={inputCls}
            >
              <option value="">Default (from env)</option>
              <option value="lmstudio">LM Studio (local)</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </Field>

          <Field label="Model" hint="e.g. google/gemma-4-12b or claude-sonnet-4-6">
            <input value={llmModel} onChange={(e) => setLlmModel(e.target.value)} className={inputCls} placeholder="Leave blank for env default" />
          </Field>

          <Field label="LM Studio base URL">
            <input value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} className={inputCls} placeholder="http://localhost:1234/v1" />
          </Field>

          <Field
            label="API key"
            hint={initial.apiKeySet ? "A key is saved. Enter a new one to replace it; leave blank to keep." : "Anthropic API key (stored for this workspace)."}
          >
            <input
              type="password"
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              className={inputCls}
              placeholder={initial.apiKeySet ? "••••••••  (unchanged)" : "sk-ant-…"}
              autoComplete="off"
            />
          </Field>
        </section>

        {/* Coach behavior */}
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700">AI coach &amp; agents</h2>

          <Field label="SKILLS.md" hint="Custom instructions appended to the coach's system prompt.">
            <textarea
              value={skillsMd}
              onChange={(e) => setSkillsMd(e.target.value)}
              rows={6}
              className={clsx(inputCls, "resize-y font-mono text-xs")}
              placeholder="e.g. Always use UK English. Prefer small, focused tickets."
            />
          </Field>

          <Field label="Working directory" hint="Stored for a future autonomous-agent runtime (not used yet).">
            <input value={workingDir} onChange={(e) => setWorkingDir(e.target.value)} className={inputCls} placeholder="/path/to/workspace" />
          </Field>

          <Field label="Tools the coach may use" hint="Unchecked tools are hidden from the coach. (External MCP agents are unaffected.)">
            <div className="space-y-1.5">
              {tools.map((t) => (
                <label key={t.name} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled.has(t.name)}
                    onChange={() => toggleTool(t.name)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
                  />
                  <span>
                    <span className="font-mono text-gray-800">{t.name}</span>
                    <span className="ml-2 text-xs text-gray-400">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-800 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save settings"}
          </button>
          {status === "saved" && <span className="text-sm text-teal-600">Saved ✓</span>}
          {status === "error" && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
