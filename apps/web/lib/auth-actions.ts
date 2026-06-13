"use server";

import { db, eq } from "@questvault/db";
import { users } from "@questvault/db/schema";
import { signOut } from "./auth";
import { adminExists } from "./queries";
import { hashPassword } from "./password";
import { registerSchema, type RegisterInput } from "./auth-rules";

export type { RegisterInput };

export async function signOutAction() {
  await signOut({ redirectTo: "/auth/login" });
}

// ─── Registration (first-run admin setup) ────────────────────────────────────

/**
 * Create the first (admin) user. First-run only: rejected once any real user
 * exists. The caller signs in with the same credentials afterward.
 */
export async function registerUser(input: RegisterInput) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const { displayName, email, password } = parsed.data;

  // First-run gate. Re-checked here (not just in the page) so registration
  // cannot be re-opened by hitting the action directly.
  if (await adminExists()) {
    return { ok: false as const, error: "Registration is closed." };
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    return { ok: false as const, error: "Email already in use." };
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, displayName, passwordHash, role: "admin" });

  return { ok: true as const };
}
