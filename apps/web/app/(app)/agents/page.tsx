import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { allTools } from "@questvault/tools";
import { requireAdmin } from "@/lib/authz";
import { listAgentTokens } from "@/lib/queries";
import { AgentsManager } from "@/components/agents/agents-manager";

export const metadata: Metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  if (!(await requireAdmin())) redirect("/dashboard");

  const tokens = await listAgentTokens();
  const tools = allTools.map((t) => ({ name: t.name, description: t.description }));

  return <AgentsManager tokens={tokens} tools={tools} />;
}
