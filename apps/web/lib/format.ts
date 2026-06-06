/**
 * Presentation helpers shared across pages — status/priority metadata,
 * avatar initials, date formatting, level math.
 */
import { xpToLevel, levelToMinXp } from "@questvault/gamification";

export type TicketStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "archived";

export type TicketPriority = "p0" | "p1" | "p2" | "p3";

/** Board columns, left → right. `archived` is intentionally excluded. */
export const BOARD_COLUMNS: TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
];

export const STATUS_META: Record<
  TicketStatus,
  { label: string; dot: string; bar: string; chip: string }
> = {
  backlog:     { label: "Backlog",     dot: "bg-gray-400",   bar: "bg-gray-400",  chip: "bg-gray-100 text-gray-600" },
  todo:        { label: "Todo",        dot: "bg-sky-400",    bar: "bg-sky-500",   chip: "bg-sky-50 text-sky-700" },
  in_progress: { label: "In Progress", dot: "bg-amber-400",  bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
  in_review:   { label: "In Review",   dot: "bg-brand-400",  bar: "bg-brand-600", chip: "bg-brand-50 text-brand-600" },
  done:        { label: "Done",        dot: "bg-teal-400",   bar: "bg-teal-600",  chip: "bg-teal-50 text-teal-600" },
  archived:    { label: "Archived",    dot: "bg-gray-300",   bar: "bg-gray-300",  chip: "bg-gray-100 text-gray-500" },
};

export const PRIORITY_META: Record<
  TicketPriority,
  { label: string; chip: string; title: string }
> = {
  p0: { label: "P0", chip: "bg-red-50 text-red-600 ring-red-200",      title: "Critical" },
  p1: { label: "P1", chip: "bg-orange-50 text-orange-600 ring-orange-200", title: "High" },
  p2: { label: "P2", chip: "bg-brand-50 text-brand-600 ring-brand-200", title: "Medium" },
  p3: { label: "P3", chip: "bg-gray-100 text-gray-500 ring-gray-200",   title: "Low" },
};

/** Deterministic accent color for an avatar, derived from a seed string. */
const AVATAR_COLORS = [
  "bg-brand-600",
  "bg-teal-600",
  "bg-amber-500",
  "bg-sky-600",
  "bg-rose-500",
  "bg-violet-600",
];

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

/** Level + progress toward the next level, from lifetime XP. */
export function levelProgress(xpTotal: number) {
  const level = xpToLevel(xpTotal);
  const floor = levelToMinXp(level);
  const ceil = levelToMinXp(level + 1);
  const span = ceil - floor || 1;
  const pct = Math.min(100, Math.max(0, Math.round(((xpTotal - floor) / span) * 100)));
  return { level, floor, ceil, pct, toNext: Math.max(0, ceil - xpTotal) };
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Whole days from now until `d` (negative if past). */
export function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}
