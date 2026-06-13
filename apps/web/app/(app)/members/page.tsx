import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { listMembers, listPendingInvites } from "@/lib/queries";
import { MembersManager } from "@/components/members/members-manager";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard");

  const [members, invites] = await Promise.all([listMembers(), listPendingInvites()]);

  return (
    <MembersManager members={members} invites={invites} currentUserId={admin.id} />
  );
}
