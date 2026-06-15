"use client";

/**
 * Admin Agents page: mint per-agent MCP tokens with a per-tool scope allowlist,
 * and revoke them. The raw token is shown once at creation (never stored).
 */
import { useState, useTransition } from "react";
import { createAgentToken, revokeAgentToken } from "@/lib/agent-actions";
import type { AgentTokenRow } from "@/lib/queries";

type ToolInfo = { name: string; description: string };

export function AgentsManager({
  tokens,
  tools,
}: {
  tokens: AgentTokenRow[];
  tools: ToolInfo[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [allTools, setAllTools] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggle(tool: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(tool) ? next.delete(tool) : next.add(tool);
      return next;
    });
  }

  function submit() {
    setError(null);
    setMinted(null);
    if (!name.trim()) {
      setError("Enter a name for the agent.");
      return;
    }
    const scopes = allTools ? ["*"] : Array.from(selected);
    startTransition(async () => {
      const res = await createAgentToken({ name, scopes });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMinted(res.token);
      setName("");
      setSelected(new Set());
      setAllTools(true);
    });
  }

  function copyToken() {
    if (!minted) return;
    void navigator.clipboard.writeText(minted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function revoke(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await revokeAgentToken(id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Per-agent MCP tokens with scoped tool access. Point an MCP client at{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">:3003/mcp</code>{" "}
          with <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">Authorization: Bearer &lt;token&gt;</code>.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Mint */}
      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-700">Create a token</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Agent name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CI Bot"
              className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Scopes</label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={allTools} onChange={(e) => setAllTools(e.target.checked)} />
              All tools (<code className="font-mono text-xs">*</code>)
            </label>
            {!allTools && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {tools.map((t) => (
                  <label key={t.name} className="flex items-center gap-2 text-sm text-gray-700" title={t.description}>
                    <input
                      type="checkbox"
                      checked={selected.has(t.name)}
                      onChange={() => toggle(t.name)}
                    />
                    <span className="font-mono text-xs">{t.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            Generate token
          </button>
        </div>

        {minted && (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-3">
            <p className="text-xs font-medium text-brand-700">
              Copy this token now — it won't be shown again:
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs text-gray-700">{minted}</code>
              <button
                type="button"
                onClick={copyToken}
                className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-800"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* List */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Tokens <span className="text-gray-400">({tokens.length})</span>
          </h2>
        </div>
        {tokens.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No agent tokens yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-4 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-800">{t.name}</p>
                    {t.revokedAt && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
                        revoked
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-gray-400">
                    {t.scopes.includes("*") ? "all tools" : t.scopes.join(", ")}
                    {" · "}
                    {t.lastUsedAt ? `used ${t.lastUsedAt.toLocaleDateString()}` : "never used"}
                  </p>
                </div>
                {!t.revokedAt && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revoke(t.id)}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
