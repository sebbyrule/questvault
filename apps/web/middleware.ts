// Route protection via Auth.js. Uses the edge-safe `authConfig` only (no DB) so
// it can run on the Edge runtime; the `authorized` callback decides which routes
// require a session and redirects to /auth/login otherwise.
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except API routes, Next internals, and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
