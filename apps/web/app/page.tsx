import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "QuestVault",
  description: "Gamified project management with AI coaching and agent-native workflows.",
};

const FEATURES = [
  {
    icon: "▤",
    title: "Kanban that moves",
    body: "Drag-free board with one-click column moves and live ticket counts.",
  },
  {
    icon: "✦",
    title: "XP & levels",
    body: "Earn XP for shipping work, climb levels, and unlock badges.",
  },
  {
    icon: "◇",
    title: "AI coach",
    body: "An LLM that knows your tickets and nudges the right next move.",
  },
  {
    icon: "⌘",
    title: "Agent-native",
    body: "A first-class MCP server so agents can work tickets from the terminal.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="mx-auto flex max-w-5xl flex-col px-6">
        {/* Nav */}
        <nav className="flex items-center justify-between py-6">
          <span className="flex items-center gap-2 font-bold text-gray-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">Q</span>
            QuestVault
          </span>
          <Link href="/dashboard" className="text-sm font-medium text-brand-600 hover:text-brand-800">
            Open app →
          </Link>
        </nav>

        {/* Hero */}
        <section className="py-20 text-center">
          <span className="inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-800">
            Gamified · AI-native · Agent-ready
          </span>
          <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Project management
            <br />
            <span className="text-brand-600">people actually enjoy.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-gray-500">
            Jira-class tickets with XP, streaks, and an AI coach grounded in your real work —
            plus an MCP server so Claude can ship alongside you.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/board"
              className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800"
            >
              Go to the board
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition hover:border-brand-200"
            >
              View dashboard
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-gray-200 bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg text-brand-600">
                {f.icon}
              </span>
              <h3 className="mt-4 font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{f.body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
