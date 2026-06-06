"use client";

// Floating AI coach chat. POSTs to the same-origin /api/coach proxy and reads the
// SSE stream, rendering reasoning-model "thinking" (collapsible) and the Markdown
// answer. See app/api/coach/route.ts for the server-side proxy to the Express API.
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Markdown } from "./markdown";

type Role = "user" | "assistant";
type ToolActivity = { name: string; running: boolean; ok?: boolean };
type Msg = {
  role: Role;
  content: string;
  reasoning?: string;
  tools?: ToolActivity[];
  error?: boolean;
};

const SUGGESTIONS = [
  "What should I focus on today?",
  "What's at risk in the current sprint?",
  "Break down the Kanban board ticket into subtasks.",
];

export function CoachPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");

    const history = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));

    // optimistic: user bubble + empty assistant bubble we stream into
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setBusy(true);

    const fail = (msg: string) =>
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: msg, error: true };
        return copy;
      });

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        fail(data.error ?? `Request failed (${res.status}).`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let received = false;
      let gotText = false;

      const append = (kind: "reasoning" | "text", delta: string) =>
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant") {
            copy[copy.length - 1] =
              kind === "text"
                ? { ...last, content: last.content + delta }
                : { ...last, reasoning: (last.reasoning ?? "") + delta };
          }
          return copy;
        });

      const applyTool = (info: { name: string; phase: string; ok?: boolean }) =>
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (!last || last.role !== "assistant") return copy;
          const tools = [...(last.tools ?? [])];
          if (info.phase === "call") {
            tools.push({ name: info.name, running: true });
          } else {
            // Mark the most recent running call of this tool as finished.
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i]!.name === info.name && tools[i]!.running) {
                tools[i] = { name: info.name, running: false, ok: info.ok };
                break;
              }
            }
          }
          copy[copy.length - 1] = { ...last, tools };
          return copy;
        });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload) as { type?: string; delta?: string };
            if (typeof obj.delta !== "string" || !obj.delta) continue;
            received = true;
            if (obj.type === "tool") {
              try {
                applyTool(
                  JSON.parse(obj.delta) as { name: string; phase: string; ok?: boolean }
                );
              } catch {
                /* ignore malformed tool payload */
              }
            } else {
              const kind = obj.type === "reasoning" ? "reasoning" : "text";
              if (kind === "text") gotText = true;
              append(kind, obj.delta);
            }
          } catch {
            /* ignore malformed SSE line */
          }
        }
      }

      if (!received) {
        fail(
          "The coach didn't return anything. Make sure LM Studio is running on :1234 with a model loaded (LLM_PROVIDER=lmstudio)."
        );
      } else if (!gotText) {
        // Reasoning model used its whole budget thinking without a final answer.
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (
            last &&
            last.role === "assistant" &&
            !last.content &&
            !(last.tools && last.tools.length > 0)
          ) {
            copy[copy.length - 1] = {
              ...last,
              content:
                "(I spent my token budget thinking and didn't reach a final answer — try again or ask something more specific.)",
            };
          }
          return copy;
        });
      }
    } catch {
      fail("Connection lost while streaming the response.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-xl text-white shadow-lg transition hover:bg-brand-800"
        aria-label="Toggle AI coach"
      >
        {open ? "×" : "✦"}
      </button>

      {/* Panel */}
      <div
        className={clsx(
          "fixed bottom-24 right-6 z-40 flex h-[32rem] w-[24rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all",
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        )}
      >
        <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">✦</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">AI Coach</p>
            <p className="text-[11px] text-gray-400">Grounded in your tickets &amp; sprint</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="pt-6 text-center">
              <p className="text-sm text-gray-500">Ask the coach about your work.</p>
              <div className="mt-4 space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-600 transition hover:border-brand-200 hover:bg-brand-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              if (m.role === "user") {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-brand-600 px-3 py-2 text-sm text-white">
                      {m.content}
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="flex flex-col items-start gap-1">
                  {m.reasoning && (
                    <details
                      className="w-[85%] rounded-lg bg-gray-50 px-2 py-1 text-[11px] text-gray-400"
                      open={!m.content}
                    >
                      <summary className="cursor-pointer select-none">
                        {m.content ? "Thoughts" : "Thinking…"}
                      </summary>
                      <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {m.reasoning}
                      </div>
                    </details>
                  )}
                  {m.tools && m.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {m.tools.map((t, ti) => (
                        <span
                          key={ti}
                          className={clsx(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            t.running
                              ? "bg-brand-50 text-brand-600"
                              : t.ok === false
                                ? "bg-red-50 text-red-600"
                                : "bg-teal-50 text-teal-700"
                          )}
                        >
                          <span>{t.running ? "⚙" : t.ok === false ? "✕" : "✓"}</span>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {(m.content || (busy && isLast)) && (
                    <div
                      className={clsx(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                        m.error ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-800"
                      )}
                    >
                      {m.content ? (
                        m.error ? (
                          <span className="whitespace-pre-wrap">{m.content}</span>
                        ) : (
                          <Markdown>{m.content}</Markdown>
                        )
                      ) : (
                        <Dots />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-gray-100 p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the coach…"
            disabled={busy}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-800 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
