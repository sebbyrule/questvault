/**
 * Invite-acceptance page (server). Validates the one-time token; on success the
 * invitee sets a display name + password. Invalid/expired/used tokens get a
 * friendly message instead of the form.
 */
import Link from "next/link";
import { getInviteByToken } from "@/lib/queries";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await getInviteByToken(params.token);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-brand-600 tracking-tight">QuestVault</h1>
          <p className="mt-1 text-sm text-gray-500">Gamified project management</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {invite ? (
            <AcceptInviteForm token={params.token} email={invite.email} />
          ) : (
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">Invite not valid</h2>
              <p className="text-sm text-gray-500">
                This invite link has expired or has already been used. Ask an admin
                for a new one.
              </p>
              <Link
                href="/auth/login"
                className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline"
              >
                Go to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
