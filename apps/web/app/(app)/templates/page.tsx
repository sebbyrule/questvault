import type { Metadata } from "next";
import { db } from "@questvault/db";
import { BUILTIN_TEMPLATES, getSavedTemplates, toSavedCard } from "@/lib/templates";
import { getProjectCards } from "@/lib/queries";
import { TemplateHub } from "@/components/template-hub";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [savedRows, projectCards] = await Promise.all([
    getSavedTemplates(db),
    getProjectCards(),
  ]);

  const builtins = BUILTIN_TEMPLATES.map((b) => ({
    key: b.key,
    name: b.name,
    description: b.description,
    iconEmoji: b.iconEmoji,
    color: b.color,
    labelCount: b.definition.labels.length,
    ticketCount: b.definition.tickets.length,
    hasSprint: !!b.definition.sprint,
  }));
  const saved = savedRows.map(toSavedCard);
  const projects = projectCards.map((p) => ({ id: p.id, name: p.name }));

  return <TemplateHub builtins={builtins} saved={saved} projects={projects} />;
}
