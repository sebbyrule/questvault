"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetPassword } from "@/lib/password-actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const res = await resetPassword({ token, password });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/auth/login"), 1500);
  };

  if (done) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Password updated</h2>
        <p className="text-sm text-gray-500">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Choose a new password</h2>
      <p className="text-sm text-gray-500 mb-6">Set a new password for your account.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 text-white py-2 px-4 text-sm font-medium hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </>
  );
}
