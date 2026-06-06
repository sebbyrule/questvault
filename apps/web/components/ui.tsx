/**
 * Small presentational primitives shared across pages. All server-safe
 * (no hooks) — interactive pieces live in their own client components.
 */
import { clsx } from "clsx";
import {
  initials,
  avatarColor,
  PRIORITY_META,
  STATUS_META,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/format";

export function Avatar({
  name,
  url,
  size = "md",
}: {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dims = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-11 w-11 text-sm" }[size];
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className={clsx(dims, "rounded-full object-cover")} />;
  }
  return (
    <span
      title={name}
      className={clsx(
        dims,
        avatarColor(name),
        "inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-white"
      )}
    >
      {initials(name)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const m = PRIORITY_META[priority];
  return (
    <span
      title={m.title}
      className={clsx(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        m.chip
      )}
    >
      {m.label}
    </span>
  );
}

export function StatusChip({ status }: { status: TicketStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", m.chip)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600"
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx("rounded-2xl border border-gray-200 bg-white", className)}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "text-gray-900",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={clsx("mt-2 text-3xl font-bold tracking-tight", accent)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </Card>
  );
}
