/**
 * Project templates: built-in presets (code) + saved templates (DB). Both share
 * the TemplateDefinition shape from @questvault/db; applying one seeds labels, an
 * optional sprint, and starter tickets into a new project.
 */
import type { Database, TemplateDefinition } from "@questvault/db";

export type { TemplateDefinition };

export type BuiltinTemplate = {
  key: string;
  name: string;
  description: string;
  iconEmoji: string;
  color: string;
  definition: TemplateDefinition;
};

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    key: "scrum",
    name: "Scrum Sprint",
    description: "Sprint-based workflow with an active sprint and starter tickets.",
    iconEmoji: "🏃",
    color: "#534AB7",
    definition: {
      labels: [
        { name: "bug", color: "#E24B4A" },
        { name: "feature", color: "#534AB7" },
        { name: "chore", color: "#0F6E56" },
      ],
      sprint: { name: "Sprint 1", goal: "Ship the first milestone" },
      tickets: [
        { title: "Define the sprint goal", priority: "p1", labels: ["chore"] },
        {
          title: "Set up CI pipeline",
          description: "Run lint, test, and build on every pull request.",
          priority: "p2",
          storyPoints: 3,
          labels: ["chore"],
        },
        { title: "First feature spike", priority: "p2", storyPoints: 5, labels: ["feature"] },
      ],
    },
  },
  {
    key: "bug-tracker",
    name: "Bug Tracker",
    description: "Triage-focused board for tracking and prioritising bugs.",
    iconEmoji: "🐛",
    color: "#E24B4A",
    definition: {
      labels: [
        { name: "bug", color: "#E24B4A" },
        { name: "regression", color: "#B45309" },
        { name: "triage", color: "#6B7280" },
      ],
      tickets: [
        {
          title: "Triage incoming bugs",
          description: "Review the inbox and assign priority + labels.",
          priority: "p1",
          labels: ["triage"],
        },
        { title: "Add a bug report template", priority: "p3", labels: ["triage"] },
      ],
    },
  },
  {
    key: "content-calendar",
    name: "Content Calendar",
    description: "Plan blog, social, and design work for the month.",
    iconEmoji: "🗓️",
    color: "#0EA5E9",
    definition: {
      labels: [
        { name: "blog", color: "#534AB7" },
        { name: "social", color: "#0EA5E9" },
        { name: "design", color: "#DB2777" },
      ],
      sprint: { name: "This Month" },
      tickets: [
        { title: "Draft blog post", priority: "p2", labels: ["blog"] },
        { title: "Schedule social posts", priority: "p2", labels: ["social"] },
        { title: "Design hero image", priority: "p3", labels: ["design"] },
      ],
    },
  },
];

export function getBuiltinTemplate(key: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.key === key);
}

export async function getSavedTemplates(db: Database) {
  return db.query.projectTemplates.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

/** Lightweight summary the hub UI renders for saved templates. */
export type SavedTemplateCard = {
  id: string;
  name: string;
  description: string | null;
  iconEmoji: string | null;
  color: string | null;
  labelCount: number;
  ticketCount: number;
};

export function toSavedCard(t: {
  id: string;
  name: string;
  description: string | null;
  iconEmoji: string | null;
  color: string | null;
  definition: TemplateDefinition;
}): SavedTemplateCard {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    iconEmoji: t.iconEmoji,
    color: t.color,
    labelCount: t.definition.labels.length,
    ticketCount: t.definition.tickets.length,
  };
}
