/**
 * First-run onboarding wizard. Shown to an admin until they complete (or skip)
 * setup; the (app) layout redirects here while onboarding is incomplete. Lives
 * outside the (app) route group so it renders full-screen (no sidebar).
 */
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { isOnboardingComplete, hasAnyProject, getCurrentUser } from "@/lib/queries";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  // Only admins onboard the workspace; members are sent to the board.
  const admin = await requireAdmin();
  if (!admin) redirect("/board");
  if (await isOnboardingComplete()) redirect("/board");

  const [hasProject, user] = await Promise.all([hasAnyProject(), getCurrentUser()]);

  return (
    <main className="min-h-screen bg-gray-50">
      <OnboardingWizard hasProject={hasProject} adminName={user?.displayName ?? "there"} />
    </main>
  );
}
