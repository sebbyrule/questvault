"use client";

/**
 * Admin Members page: invite new teammates (one-time link), change roles, and
 * (de)activate accounts. Invite links are shown once at creation — the raw
 * token is never stored, so pending invites can only be revoked, not re-copied.
 */
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { Avatar } from "../ui";
import {
  createInvite,
  updateUserRole,
  setUserActive,
  revokeInvite,
} from "@/lib/member-actions";
import type { MemberRow, PendingInvite } from "@/lib/queries";

const ASSIGNABLE_ROLES = ["admin", "member", "viewer"] as const;

export function MembersManager({
  members,
  invites,
  currentUserId,
}: {
  members: MemberRow[];
  invites: PendingInvite[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ASSIGNABLE_ROLES)[number]>("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
    });
  }

  function submitInvite() {
    setError(null);
    setInviteLink(null);
    setCopied(false);
    if (!email.trim()) {
      setError("Enter an email to invite.");
      return;
    }
    startTransition(async () => {
      const res = await createInvite({ email, role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInviteLink(`${window.location.origin}/auth/invite/${res.token}`);
      setEmail("");
    });
  }

  function copyLink() {
    if (!inviteLink) return;
    void navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Members</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Invite teammates, manage roles, and deactivate accounts.
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Invite */}
      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-700">Invite a member</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ASSIGNABLE_ROLES)[number])}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={submitInvite}
            disabled={pending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            Generate invite link
          </button>
        </div>

        {inviteLink && (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-3">
            <p className="text-xs font-medium text-brand-700">
              Share this one-time link (shown only once):
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs text-gray-700">
                {inviteLink}
              </code>
              <button
                type="button"
                onClick={copyLink}
                className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-800"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Members table */}
      <section className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Team <span className="text-gray-400">({members.length})</span>
          </h2>
        </div>
        <ul className="divide-y divide-gray-100">
          {members.map((m) => {
            const isSelf = m.id === currentUserId;
            return (
              <li key={m.id} className="flex items-center gap-4 px-6 py-3">
                <Avatar name={m.displayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {m.displayName} {isSelf && <span className="text-gray-400">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-gray-400">{m.email}</p>
                </div>

                {!m.isActive && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    Deactivated
                  </span>
                )}

                <select
                  value={ASSIGNABLE_ROLES.includes(m.role as never) ? m.role : "member"}
                  disabled={pending}
                  onChange={(e) => run(() => updateUserRole(m.id, e.target.value))}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={pending || isSelf}
                  onClick={() => run(() => setUserActive(m.id, !m.isActive))}
                  title={isSelf ? "You can't deactivate yourself" : undefined}
                  className={clsx(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-40",
                    m.isActive
                      ? "text-red-600 hover:bg-red-50"
                      : "text-teal-600 hover:bg-teal-50"
                  )}
                >
                  {m.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Pending invites */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Pending invites <span className="text-gray-400">({invites.length})</span>
          </h2>
        </div>
        {invites.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No outstanding invites.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center gap-4 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">{inv.email}</p>
                  <p className="text-xs text-gray-400">
                    role {inv.role} · expires {inv.expiresAt.toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => revokeInvite(inv.id))}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
