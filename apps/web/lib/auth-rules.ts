/**
 * Pure auth/member decision logic + input schemas — no DB, no Next runtime
 * (only `zod` + `node:crypto`), so it is safe to unit-test directly. The
 * DB-coupled server actions and queries import from here.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export const roleSchema = z.enum(ROLES);

/** SHA-256 of a raw invite token. The raw token only ever lives in the URL. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** An invite is usable while it is unaccepted and not yet expired. */
export function isInviteUsable(
  invite: { acceptedAt: Date | null; expiresAt: Date },
  now: Date = new Date()
): boolean {
  if (invite.acceptedAt) return false;
  return invite.expiresAt.getTime() > now.getTime();
}

/** A password reset is usable while it is unused and not yet expired. */
export function isResetUsable(
  reset: { usedAt: Date | null; expiresAt: Date },
  now: Date = new Date()
): boolean {
  if (reset.usedAt) return false;
  return reset.expiresAt.getTime() > now.getTime();
}

/** An admin demoting themselves below admin/owner — must be blocked. */
export function isSelfLockout(actorId: string, targetId: string, newRole: string): boolean {
  return actorId === targetId && newRole !== "admin" && newRole !== "owner";
}

/** An admin deactivating their own account — must be blocked. */
export function isSelfDeactivate(actorId: string, targetId: string): boolean {
  return actorId === targetId;
}

// ─── Input schemas ────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: roleSchema,
});

export const acceptSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().trim().min(1, "Name is required").max(80),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const changePasswordSchema = z.object({
  // Optional: hash-less dev accounts (devpass fallback) have no current password.
  currentPassword: z.string().max(200).optional().default(""),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export type RegisterInput = z.input<typeof registerSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
export type AcceptInput = z.infer<typeof acceptSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
