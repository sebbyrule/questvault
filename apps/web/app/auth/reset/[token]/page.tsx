/**
 * Password-reset page (server). Validates the one-time token; on success the
 * user sets a new password. Invalid/expired/used tokens get a friendly message.
 */
import Link from "next/link";
import { getUsablePasswordReset } from "@/lib/queries";
import { ResetPasswordForm } from "@/components/auth/reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: { token: string } }) {
  const reset = await getUsablePasswordReset(params.token);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-brand-600 tracking-tight">QuestVault</h1>
          <p className="mt-1 text-sm text-gray-500">Gamified project management</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {reset ? (
            <ResetPasswordForm token={params.token} />
          ) : (
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">Reset link not valid</h2>
              <p className="text-sm text-gray-500">
                This password-reset link has expired or has already been used. Ask
                an admin for a new one.
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
