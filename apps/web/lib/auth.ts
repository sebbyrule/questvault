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
import { verifyPassword } from "./password";

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

    let user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    // Deactivated accounts cannot sign in (blocks both the hash and dev paths).
    if (user && !user.isActive) return null;

    // Registered users (have a password hash) verify via bcrypt — in ALL envs.
    if (user?.passwordHash) {
      const ok = await verifyPassword(password, user.passwordHash);
      return ok ? { id: user.id, email: user.email, name: user.displayName } : null;
    }

    // Hash-less rows (seeded dev users, or brand-new emails): DEV-ONLY shortcut
    // — accept the literal "devpass". Find-or-create so session.user.id is a
    // valid UUID for FK attribution.
    if (process.env.NODE_ENV === "production" || password !== "devpass") {
      return null;
    }
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
