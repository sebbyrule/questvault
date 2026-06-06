"use client";

/**
 * Full ticket detail view: inline-editable title/description, a properties
 * panel (status, priority, assignee, story points, sprint, due date, PR link,
 * labels), a comment thread with composer, and the activity (history) feed.
 *
 * Reads render from server props; every edit calls a server action and relies
 * on revalidation to refresh the props. Local edit buffers re-sync when the
 * underlying prop changes (see the small useEffect mirrors below).
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Avatar, PriorityBadge } from "./ui";
import { Markdown } from "./markdown";
import {
  STATUS_META,
  PRIORITY_META,
  formatDateTime,
  timeAgo,
  type TicketStatus,
  type TicketPriority,
} from "@/lib/format";
import {
  updateTicketDetails,
  addComment,
  editComment,
  setTicketLabels,
} from "@/lib/actions";
import type {
  TicketDetail as TicketDetailData,
  TicketComment,
  TicketHistoryEntry,
  Person,
  LabelChip,
  SprintOption,
} from "@/lib/queries";

const STATUSES: TicketStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "archived",
];
const PRIORITIES: TicketPriority[] = ["p0", "p1", "p2", "p3"];
const POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21];

function personName(person: Person | null, agentId: string | null): string {
  if (person) return person.displayName;
  if (agentId) return `${agentId} (agent)`;
  return "Unknown";
}

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  story_points: "story points",
  assignee: "assignee",
  sprint: "sprint",
  due_date: "due date",
  pr_url: "PR link",
  labels: "labels",
};

export function TicketDetail({
  ticket,
  members,
  projectLabels,
  sprints,
  currentUser,
}: {
  ticket: TicketDetailData;
  members: Person[];
  projectLabels: LabelChip[];
  sprints: SprintOption[];
  currentUser: Person | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Title + description edit buffers, re-synced when the server props change.
  const [title, setTitle] = useState(ticket.title);
  const [editingTitle, setEditingTitle] = useState(false);
  useEffect(() => setTitle(ticket.title), [ticket.title]);

  const [desc, setDesc] = useState(ticket.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  useEffect(() => setDesc(ticket.description ?? ""), [ticket.description]);

  const [pr, setPr] = useState(ticket.prUrl ?? "");
  useEffect(() => setPr(ticket.prUrl ?? ""), [ticket.prUrl]);

  function save(patch: Parameters<typeof updateTicketDetails>[1]) {
    startTransition(async () => {
      const res = await updateTicketDetails(ticket.id, patch);
      setError(res.ok ? null : res.error ?? "Save failed");
    });
  }

  function commitTitle() {
    setEditingTitle(false);
    const trimmed = title.trim();
    if (trimmed && trimmed !== ticket.title) save({ title: trimmed });
    else setTitle(ticket.title);
  }

  function commitDesc() {
    setEditingDesc(false);
    if (desc !== (ticket.description ?? "")) save({ description: desc || null });
  }

  function toggleLabel(id: string) {
    const next = new Set(ticket.labels.map((l) => l.id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    startTransition(async () => {
      const res = await setTicketLabels(ticket.id, Array.from(next));
      setError(res.ok ? null : res.error ?? "Save failed");
    });
  }

  const activeLabelIds = new Set(ticket.labels.map((l) => l.id));
  const dueDateInput = ticket.dueDate
    ? new Date(ticket.dueDate).toISOString().slice(0, 10)
    : "";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-8 py-4">
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <Link href="/board" className="hover:text-gray-600">
            ← Board
          </Link>
          <span className="font-mono">QV-{ticket.number}</span>
          {pending && <span className="text-xs text-brand-600">Saving…</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>

        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitle(ticket.title);
                setEditingTitle(false);
              }
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1 text-2xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        ) : (
          <h1
            onClick={() => setEditingTitle(true)}
            className="mt-1 cursor-text rounded-lg px-2 py-1 text-2xl font-bold text-gray-900 hover:bg-gray-50"
            title="Click to edit"
          >
            {ticket.title}
          </h1>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl gap-6 p-6 lg:grid-cols-[1fr_300px]">
          {/* ─── Main column ─────────────────────────────────────────── */}
          <div className="space-y-6">
            {/* Description */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Description</h2>
                {!editingDesc && (
                  <button
                    type="button"
                    onClick={() => setEditingDesc(true)}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingDesc ? (
                <div>
                  <textarea
                    autoFocus
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={6}
                    placeholder="Add a description (Markdown supported)…"
                    className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={commitDesc}
                      disabled={pending}
                      className="rounded-lg bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDesc(ticket.description ?? "");
                        setEditingDesc(false);
                      }}
                      className="rounded-lg px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : ticket.description ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4 text-gray-700">
                  <Markdown>{ticket.description}</Markdown>
                </div>
              ) : (
                <p
                  onClick={() => setEditingDesc(true)}
                  className="cursor-text rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-400"
                >
                  No description yet — click to add one.
                </p>
              )}
            </section>

            {/* Comments */}
            <section>
              <h2 className="mb-3 text-sm font-semibold text-gray-700">
                Comments{" "}
                <span className="text-gray-400">({ticket.comments.length})</span>
              </h2>

              <div className="space-y-4">
                {ticket.comments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    ticketId={ticket.id}
                    canEdit={!!currentUser && c.author?.id === currentUser.id}
                  />
                ))}
                {ticket.comments.length === 0 && (
                  <p className="text-sm text-gray-400">No comments yet.</p>
                )}
              </div>

              <CommentComposer ticketId={ticket.id} currentUser={currentUser} />
            </section>
          </div>

          {/* ─── Properties sidebar ──────────────────────────────────── */}
          <aside className="space-y-5">
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4">
              <Field label="Status">
                <select
                  value={ticket.status}
                  disabled={pending}
                  onChange={(e) => save({ status: e.target.value as TicketStatus })}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Priority">
                <select
                  value={ticket.priority}
                  disabled={pending}
                  onChange={(e) =>
                    save({ priority: e.target.value as TicketPriority })
                  }
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p.toUpperCase()} · {PRIORITY_META[p].title}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Assignee">
                <select
                  value={ticket.assignee?.id ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    save({ assigneeId: e.target.value || null })
                  }
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Story points">
                <select
                  value={ticket.storyPoints?.toString() ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    save({
                      storyPoints: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">—</option>
                  {POINT_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Sprint">
                <select
                  value={ticket.sprint?.id ?? ""}
                  disabled={pending}
                  onChange={(e) => save({ sprintId: e.target.value || null })}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">No sprint</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Due date">
                <input
                  type="date"
                  value={dueDateInput}
                  disabled={pending}
                  onChange={(e) =>
                    save({
                      dueDate: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </Field>

              <Field label="PR link">
                <div className="flex gap-1.5">
                  <input
                    value={pr}
                    onChange={(e) => setPr(e.target.value)}
                    onBlur={() => {
                      if ((pr || null) !== (ticket.prUrl ?? null))
                        save({ prUrl: pr || null });
                    }}
                    placeholder="https://github.com/…"
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              </Field>

              {/* Labels */}
              <Field label="Labels">
                {projectLabels.length === 0 ? (
                  <p className="text-xs text-gray-400">No labels in this project.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {projectLabels.map((l) => {
                      const active = activeLabelIds.has(l.id);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          disabled={pending}
                          onClick={() => toggleLabel(l.id)}
                          className={clsx(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition",
                            active
                              ? "border-transparent bg-gray-100 text-gray-700"
                              : "border-gray-200 text-gray-400 hover:bg-gray-50"
                          )}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: l.color }}
                          />
                          {l.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>
            </div>

            {/* Meta */}
            <div className="space-y-1.5 rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
              <div className="flex items-center justify-between">
                <span>Reporter</span>
                <span className="flex items-center gap-1.5 text-gray-700">
                  {ticket.reporter && (
                    <Avatar
                      name={ticket.reporter.displayName}
                      url={ticket.reporter.avatarUrl}
                      size="sm"
                    />
                  )}
                  {ticket.reporter?.displayName ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Created</span>
                <span className="text-gray-700">{formatDateTime(ticket.createdAt)}</span>
              </div>
              {ticket.closedAt && (
                <div className="flex items-center justify-between">
                  <span>Closed</span>
                  <span className="text-gray-700">
                    {formatDateTime(ticket.closedAt)}
                  </span>
                </div>
              )}
            </div>

            {/* Activity */}
            <section className="rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">Activity</h2>
              {ticket.history.length === 0 ? (
                <p className="text-xs text-gray-400">No changes yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {ticket.history.map((h) => (
                    <HistoryRow key={h.id} entry={h} />
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function HistoryRow({ entry }: { entry: TicketHistoryEntry }) {
  const who = personName(entry.actor, entry.agentId);
  const field = FIELD_LABELS[entry.field] ?? entry.field;
  return (
    <li className="text-xs leading-relaxed text-gray-500">
      <span className="font-medium text-gray-700">{who}</span> changed {field}
      {entry.oldValue != null && (
        <>
          {" "}
          from <span className="text-gray-600">{entry.oldValue}</span>
        </>
      )}
      {entry.newValue != null && (
        <>
          {" "}
          to <span className="text-gray-600">{entry.newValue}</span>
        </>
      )}
      <span className="ml-1 text-gray-400">· {timeAgo(entry.createdAt)}</span>
    </li>
  );
}

function CommentItem({
  comment,
  ticketId,
  canEdit,
}: {
  comment: TicketComment;
  ticketId: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [pending, startTransition] = useTransition();
  useEffect(() => setBody(comment.body), [comment.body]);

  const name = personName(comment.author, comment.agentId);

  function commit() {
    const trimmed = body.trim();
    if (!trimmed || trimmed === comment.body) {
      setBody(comment.body);
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await editComment(comment.id, ticketId, trimmed);
      setEditing(false);
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar name={name} url={comment.author?.avatarUrl} size="sm" />
        <span className="text-sm font-medium text-gray-800">{name}</span>
        <span className="text-xs text-gray-400">· {timeAgo(comment.createdAt)}</span>
        {comment.isEdited && <span className="text-xs text-gray-400">(edited)</span>}
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto text-xs font-medium text-brand-600 hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={commit}
              disabled={pending}
              className="rounded-lg bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setBody(comment.body);
                setEditing(false);
              }}
              className="rounded-lg px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="text-gray-700">
          <Markdown>{comment.body}</Markdown>
        </div>
      )}
    </div>
  );
}

function CommentComposer({
  ticketId,
  currentUser,
}: {
  ticketId: string;
  currentUser: Person | null;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      const res = await addComment(ticketId, body.trim());
      if (res.ok) {
        setBody("");
        setError(null);
      } else {
        setError(res.error ?? "Failed to add comment");
      }
    });
  }

  return (
    <div className="mt-4 flex gap-2">
      {currentUser && (
        <Avatar
          name={currentUser.displayName}
          url={currentUser.avatarUrl}
          size="sm"
        />
      )}
      <div className="flex-1">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Add a comment (Markdown supported)…"
          className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !body.trim()}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {pending ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}
