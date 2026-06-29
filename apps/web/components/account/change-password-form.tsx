"use client";

import { useState, useTransition } from "react";
import { changeOwnPassword } from "@/lib/password-actions";

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  function submit() {
    setError("");
    setOk(false);
    if (newPassword !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    startTransition(async () => {
      const res = await changeOwnPassword({ currentPassword, newPassword });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOk(true);
      setCurrent("");
      setNew("");
      setConfirm("");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Current password</label>
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Leave blank if you've never set one"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">New password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          placeholder="At least 8 characters"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Confirm new password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
      {ok && (
        <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-700">
          ✓ Password updated.
        </p>
      )}

      <button type="button" onClick={submit} disabled={pending} className="btn-primary">
        Update password
      </button>
    </div>
  );
}
