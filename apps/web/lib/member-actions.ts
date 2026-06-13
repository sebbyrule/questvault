"use server";

/**
 * Admin member-management actions: invite (one-time link), accept, change role,
 * (de)activate, revoke. Admin actions are gated by requireAdmin(); acceptInvite
 * is public (the token is the credential). See ~/.claude/plans for the design.
 */
import { randomBytes } from "node:crypto";
import { db, eq, and, isNull, gt } from "@questvault/db";
import { users, invites } from "@questvault/db/schema";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./authz";
import { hashPassword } from "./password";
import { getInviteByToken } from "./queries";
import {
  hashToken,
  inviteSchema,
  acceptSchema,
  roleSchema,
  isSelfLockout,
  isSelfDeactivate,
  type InviteInput,
  type AcceptInput,
} from "./auth-rules";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type { InviteInput, AcceptInput };

/**
 * Create a one-time invite. Returns the RAW token (caller builds the URL); only
 * its hash is persisted.
 */
export async function createInvite(input: InviteInput) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "Forbidden" };

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid invite" };
  }
  const { email, role } = parsed.data;

  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existingUser) return { ok: false as const, error: "A user with that email already exists." };

  const pending = await db
    .select({ id: invites.id })
    .from(invites)
    .where(
      and(eq(invites.email, email), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date()))
    )
    .limit(1);
  if (pending.length > 0) {
    return { ok: false as const, error: "An invite for that email is already pending." };
  }

  const token = randomBytes(32).toString("base64url");
  await db.insert(invites).values({
    email,
    role,
    tokenHash: hashToken(token),
    invitedBy: admin.id,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  revalidatePath("/members");
  return { ok: true as const, token };
}

/** Accept an invite: create the user with the invite's email + role, sign-in is the caller's job. */
export async function acceptInvite(input: AcceptInput) {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const { token, displayName, password } = parsed.data;

  const invite = await getInviteByToken(token);
  if (!invite) return { ok: false as const, error: "This invite is no longer valid." };

  const existing = await db.query.users.findFirst({ where: eq(users.email, invite.email) });
  if (existing) return { ok: false as const, error: "An account for this email already exists." };

  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ email: invite.email, displayName, passwordHash, role: invite.role });
    await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
  });

  return { ok: true as const, email: invite.email };
}

export async function updateUserRole(userId: string, role: string) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "Forbidden" };

  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { ok: false as const, error: "Invalid role" };

  // Self-lockout guard: an admin cannot demote themselves out of admin/owner.
  if (isSelfLockout(admin.id, userId, parsed.data)) {
    return { ok: false as const, error: "You can't remove your own admin role." };
  }

  await db.update(users).set({ role: parsed.data, updatedAt: new Date() }).where(eq(users.id, userId));
  revalidatePath("/members");
  return { ok: true as const };
}

export async function setUserActive(userId: string, active: boolean) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "Forbidden" };

  if (isSelfDeactivate(admin.id, userId) && !active) {
    return { ok: false as const, error: "You can't deactivate your own account." };
  }

  await db.update(users).set({ isActive: active, updatedAt: new Date() }).where(eq(users.id, userId));
  revalidatePath("/members");
  return { ok: true as const };
}

export async function revokeInvite(inviteId: string) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Forbidden" };
  await db.delete(invites).where(eq(invites.id, inviteId));
  revalidatePath("/members");
  return { ok: true as const };
}
