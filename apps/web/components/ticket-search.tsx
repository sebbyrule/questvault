"use client";

// Board-header ticket search. Debounced; calls searchTicketsAction (semantic
// with full-text fallback) and shows a ranked results dropdown.
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { searchTicketsAction } from "@/lib/actions";
import type { SearchResult } from "@/lib/search";

export function TicketSearch({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResult(null);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await searchTicketsAction(projectId, q);
        setResult(res);
        setOpen(true);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [query, projectId]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={boxRef} className="relative w-64">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => result && setOpen(true)}
        placeholder="Search tickets…"
        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      />

      {open && result && (
        <div className="absolute z-30 mt-1 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5 text-[11px] text-gray-400">
            <span>{result.results.length} result{result.results.length === 1 ? "" : "s"}</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium uppercase tracking-wide">
              {result.mode}
            </span>
          </div>
          {result.results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400">
              {pending ? "Searching…" : "No matching tickets."}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {result.results.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/board/${r.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span className="font-mono text-xs text-gray-400">QV-{r.number}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-800">{r.title}</span>
                    <span className="shrink-0 text-[11px] text-gray-400">{r.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
