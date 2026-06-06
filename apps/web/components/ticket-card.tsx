"use client";

// A board ticket card. Hovering reveals ← / → controls that move the ticket to
// the adjacent column via the moveTicket server action (optimistic transition).
import { useTransition } from "react";
import { clsx } from "clsx";
import { Avatar, PriorityBadge, LabelChip } from "./ui";
import { BOARD_COLUMNS, type TicketStatus } from "@/lib/format";
import { moveTicket } from "@/lib/actions";
import type { BoardTicket } from "@/lib/queries";

export function TicketCard({ ticket }: { ticket: BoardTicket }) {
  const [pending, startTransition] = useTransition();

  const idx = BOARD_COLUMNS.indexOf(ticket.status);
  const prev = idx > 0 ? BOARD_COLUMNS[idx - 1] : null;
  const next = idx < BOARD_COLUMNS.length - 1 ? BOARD_COLUMNS[idx + 1] : null;

  const move = (status: TicketStatus | null) => {
    if (!status) return;
    startTransition(() => {
      void moveTicket(ticket.id, status);
    });
  };

  return (
    <div
      className={clsx(
        "group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition",
        "hover:border-brand-200 hover:shadow",
        pending && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-gray-900">{ticket.title}</p>
        <PriorityBadge priority={ticket.priority} />
      </div>

      {ticket.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ticket.labels.map((l) => (
            <LabelChip key={l.id} name={l.name} color={l.color} />
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-mono">QV-{ticket.number}</span>
          {ticket.storyPoints != null && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-500">
              {ticket.storyPoints} pt
            </span>
          )}
        </div>
        {ticket.assignee ? (
          <Avatar name={ticket.assignee.displayName} url={ticket.assignee.avatarUrl} size="sm" />
        ) : (
          <span className="h-6 w-6 rounded-full border border-dashed border-gray-300" title="Unassigned" />
        )}
      </div>

      {/* Move controls — appear on hover */}
      <div className="mt-2 flex items-center justify-between opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={() => move(prev)}
          disabled={!prev || pending}
          className="rounded-md px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-0"
        >
          ← {prev ? labelOf(prev) : ""}
        </button>
        <button
          type="button"
          onClick={() => move(next)}
          disabled={!next || pending}
          className="rounded-md px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-50 disabled:opacity-0"
        >
          {next ? labelOf(next) : ""} →
        </button>
      </div>
    </div>
  );
}

function labelOf(status: TicketStatus): string {
  return {
    backlog: "Backlog",
    todo: "Todo",
    in_progress: "In Progress",
    in_review: "In Review",
    done: "Done",
    archived: "Archived",
  }[status];
}
