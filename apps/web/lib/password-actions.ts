"use server";

/**
 * Password management:
 *  - changeOwnPassword: authenticated self-service (verifies the current
 *    password; hash-less dev accounts may set an initial one).
 *  - createPasswordReset: admin-initiated one-time reset link (no email yet, so
 *    the admin shares the link — same trust model as invites).
 *  - resetPassword: public, consumes a reset token.
 */
import { randomBytes } from "node:crypto";
import { db, eq } from "@questvault/db";
import { users, passwordResets } from "@questvault/db/schema";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./authz";
import { getCurrentUser } from "./queries";
import { hashPassword, verifyPassword } from "./password";
import {
  hashToken,
  isResetUsable,
  resetPasswordSchema,
  changePasswordSchema,
  type ResetPasswordInput,
  type ChangePasswordInput,
} from "./auth-rules";

const RESET_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Admin: mint a one-time reset link for a user. Returns the RAW token once. */
export async function createPasswordReset(userId: string) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "Forbidden" };

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true },
  });
  if (!user) return { ok: false as const, error: "User not found" };

  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResets).values({
    userId,
    tokenHash: hashToken(token),
    createdBy: admin.id,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  revalidatePath("/members");
  return { ok: true as const, token };
}

/** Public: set a new password using a reset token. Single-use. */
export async function resetPassword(input: ResetPasswordInput) {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const { token, password } = parsed.data;

  const row = await db.query.passwordResets.findFirst({
    where: eq(passwordResets.tokenHash, hashToken(token)),
  });
  if (!row || !isResetUsable(row)) {
    return { ok: false as const, error: "This reset link is no longer valid." };
  }

  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, row.userId));
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
  });
  return { ok: true as const };
}

/** Authenticated: change your own password. */
export async function changeOwnPassword(input: ChangePasswordInput) {
  const me = await getCurrentUser();
  if (!me) return { ok: false as const, error: "Not signed in" };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const { currentPassword, newPassword } = parsed.data;

  const u = await db.query.users.findFirst({
    where: eq(users.id, me.id),
    columns: { passwordHash: true },
  });
  if (!u) return { ok: false as const, error: "Account not found" };

  // Accounts with a password must prove the current one. Hash-less dev accounts
  // (devpass fallback) set their first real password without a current one.
  if (u.passwordHash) {
    const ok = await verifyPassword(currentPassword, u.passwordHash);
    if (!ok) return { ok: false as const, error: "Current password is incorrect." };
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, me.id));
  return { ok: true as const };
}
