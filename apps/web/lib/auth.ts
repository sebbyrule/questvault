/**
 * Auth.js (NextAuth v5) configuration.
 *
 * AUTH_PROVIDER controls which provider is active:
 *
 *   "credentials"  — local username + password, no external service needed.
 *                    In dev, any email + password "devpass" is accepted.
 *                    (Replace with real bcrypt check before deploying.)
 *
 *   "github"       — GitHub OAuth (requires GITHUB_CLIENT_ID + SECRET)
 *   "google"       — Google OAuth (requires GOOGLE_CLIENT_ID + SECRET)
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { z } from "zod";

const provider = process.env.AUTH_PROVIDER ?? "credentials";

// ─── Credentials provider (local dev) ────────────────────────────────────────

const credentialsProvider = Credentials({
  name: "Dev Login",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials) {
    const parsed = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).safeParse(credentials);

    if (!parsed.success) return null;

    const { email, password } = parsed.data;

    // ⚠️  DEV ONLY: accept any email with password "devpass"
    // Replace this block with a real DB lookup + bcrypt.compare() before deploying.
    if (process.env.NODE_ENV !== "production" && password === "devpass") {
      return {
        id: `dev-${email}`,
        email,
        name: email.split("@")[0],
      };
    }

    // TODO: real user lookup
    // const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    // if (!user || !await bcrypt.compare(password, user.passwordHash)) return null;
    // return { id: user.id, email: user.email, name: user.displayName };

    return null;
  },
});

// ─── Provider selection ───────────────────────────────────────────────────────

function buildProviders() {
  if (provider === "github") {
    return [GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    })];
  }
  if (provider === "google") {
    return [Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })];
  }
  // Default: local credentials
  return [credentialsProvider];
}

// ─── NextAuth config ──────────────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: buildProviders(),
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
