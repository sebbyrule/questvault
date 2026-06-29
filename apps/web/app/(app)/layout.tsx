// Shell layout for the `(app)` route group (board / dashboard / projects). The
// route group keeps these pages' URLs flat (/board, not /app/board) while sharing
// the sidebar and the globally-available AI coach panel.
//
// Middleware already gates these routes, but we also resolve the session here to
// pass the current user to the sidebar (and as defense-in-depth).
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSessionAccount, isOnboardingComplete } from "@/lib/queries";
import { isAdminRole } from "@/lib/roles";
import { AppSidebar } from "@/components/app-sidebar";
import { CoachPanel } from "@/components/coach-panel";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  // Bounce *deactivated* accounts to login — makes admin deactivation take
  // effect on the next navigation. Only redirect on a confirmed-inactive
  // account; a null lookup can happen transiently (e.g. during a Server
  // Action re-render) and must NOT bounce an otherwise-valid session.
  const account = await getSessionAccount();
  if (account && !account.isActive) redirect("/auth/login");

  // First-run: send the admin through onboarding until it's completed/skipped.
  // (/onboarding lives outside this route group, so this can't loop.)
  if (account && isAdminRole(account.role) && !(await isOnboardingComplete())) {
    redirect("/onboarding");
  }

  const user = {
    name: session.user.name ?? session.user.email ?? "User",
    email: session.user.email ?? "",
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AppSidebar user={user} role={account?.role ?? null} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <CoachPanel />
    </div>
  );
}
