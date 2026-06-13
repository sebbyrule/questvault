"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password. In dev, use password: devpass");
      return;
    }

    router.push("/dashboard");
  };

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign in</h2>

      {/* Dev notice */}
      {process.env.NODE_ENV !== "production" && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong>Dev mode:</strong> seeded users sign in with{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">devpass</code>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent
                       placeholder-gray-400"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
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
          className="w-full rounded-lg bg-brand-600 text-white py-2 px-4 text-sm font-medium
                     hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-400
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
