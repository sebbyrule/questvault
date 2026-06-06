/**
 * Auth.js (NextAuth v5) — Node-runtime instance.
 *
 * Spreads the edge-safe base from `auth.config.ts` and attaches the real
 * providers. AUTH_PROVIDER selects which one is active:
 *
 *   "credentials"  — local email + password, no external service needed.
 *                    In dev, any email + password "devpass" is accepted and
 *                    resolved to a real `users` row (created on first login) so
 *                    the session carries a valid UUID for attribution.
 *   "github"       — GitHub OAuth (requires GITHUB_CLIENT_ID + SECRET)
 *   "google"       — Google OAuth (requires GOOGLE_CLIENT_ID + SECRET)
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { db, eq } from "@questvault/db";
import { users } from "@questvault/db/schema";
import { authConfig } from "./auth.config";

const provider = process.env.AUTH_PROVIDER ?? "credentials";

// ─── Credentials provider (local dev) ────────────────────────────────────────

const credentialsProvider = Credentials({
  name: "Dev Login",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials) {
    const parsed = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse(credentials);
    if (!parsed.success) return null;

    const { email, password } = parsed.data;

    // ⚠️  DEV ONLY: accept any email with password "devpass".
    // Replace with a real passwordHash + bcrypt.compare() before deploying.
    if (process.env.NODE_ENV === "production" || password !== "devpass") {
      return null;
    }

    // Resolve to a real user row so session.user.id is a valid UUID that the
    // tickets/comments foreign keys can reference. Create on first login so the
    // dev "any email works" flow still holds.
    let user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user) {
      [user] = await db
        .insert(users)
        .values({ email, displayName: email.split("@")[0] || email })
        .returning();
    }
    if (!user) return null;

    return { id: user.id, email: user.email, name: user.displayName };
  },
});

// ─── Provider selection ───────────────────────────────────────────────────────

function buildProviders() {
  if (provider === "github") {
    return [
      GitHub({
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      }),
    ];
  }
  if (provider === "google") {
    return [
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    ];
  }
  return [credentialsProvider];
}

// ─── NextAuth instance ──────────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: buildProviders(),
});
