import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db, getAppSettings } from "@questvault/db";
import { allTools } from "@questvault/tools";
import { SettingsForm } from "@/components/settings-form";
import { requireAdmin } from "@/lib/authz";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await requireAdmin())) redirect("/dashboard");

  const s = await getAppSettings(db);
  const tools = allTools.map((t) => ({ name: t.name, description: t.description }));

  // Never send the stored API key to the client — only whether one is set.
  return (
    <SettingsForm
      tools={tools}
      initial={{
        llmProvider: s.llmProvider ?? "",
        llmModel: s.llmModel ?? "",
        llmBaseUrl: s.llmBaseUrl ?? "",
        apiKeySet: !!s.llmApiKey,
        skillsMd: s.skillsMd ?? "",
        workingDir: s.workingDir ?? "",
        enabledTools: s.enabledTools, // null = all
      }}
    />
  );
}
