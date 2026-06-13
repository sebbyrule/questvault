// Shell layout for the `(app)` route group (board / dashboard / projects). The
// route group keeps these pages' URLs flat (/board, not /app/board) while sharing
// the sidebar and the globally-available AI coach panel.
//
// Middleware already gates these routes, but we also resolve the session here to
// pass the current user to the sidebar (and as defense-in-depth).
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { CoachPanel } from "@/components/coach-panel";
import { XpToaster } from "@/components/xp-toast";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const user = {
    name: session.user.name ?? session.user.email ?? "User",
    email: session.user.email ?? "",
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AppSidebar user={user} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <CoachPanel />
      <XpToaster />
    </div>
  );
}
