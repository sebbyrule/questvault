/**
 * Edge-safe Auth.js base config.
 *
 * This half is imported by `middleware.ts` (which runs on the Edge runtime), so
 * it must NOT pull in the database or any Node-only code. The actual providers
 * — including the DB-backed credentials lookup — are added in `auth.ts`, which
 * only ever runs in the Node runtime (route handler, server actions, RSC).
 */
import type { NextAuthConfig } from "next-auth";

// Route prefixes that require an authenticated session.
const PROTECTED_PREFIXES = ["/dashboard", "/board", "/projects", "/onboarding"];

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  // Allow the dev host (localhost:3002) without an explicit AUTH_URL allowlist.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/login" },
  // Real providers are attached in auth.ts (Node runtime). Middleware only needs
  // to read the JWT, not run a provider's authorize().
  providers: [],
  callbacks: {
    // Used by middleware to gate protected routes.
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isProtected = PROTECTED_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      );
      if (isProtected) return isLoggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.email = user.email;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
