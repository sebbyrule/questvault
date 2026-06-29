/**
 * Account settings — available to every signed-in user (unlike /settings, which
 * is admin-only). For now: change your password.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/account/change-password-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  return (
    <div className="mx-auto max-w-xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Account</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Signed in as {session.user.email ?? session.user.name}
        </p>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-700">Change password</h2>
        <p className="mt-0.5 mb-4 text-xs text-gray-400">
          Pick a new password for your account.
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
