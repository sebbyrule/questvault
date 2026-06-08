"use server";

/**
 * Server action for workspace settings. Writes the singleton app_settings row.
 * Empty text fields are stored as null (→ fall back to env). The API key is
 * write-only: a blank value leaves the stored key unchanged.
 */
import { db, updateAppSettings } from "@questvault/db";
import { allTools } from "@questvault/tools";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const KNOWN_TOOLS = allTools.map((t) => t.name);

const schema = z.object({
  llmProvider: z.string().max(20),
  llmModel: z.string().max(200),
  llmBaseUrl: z.string().max(500),
  llmApiKey: z.string().max(1000),
  skillsMd: z.string().max(20000),
  workingDir: z.string().max(1000),
  enabledTools: z.array(z.string().max(100)),
});

export type SettingsInput = z.infer<typeof schema>;

const emptyToNull = (s: string): string | null => {
  const t = s.trim();
  return t ? t : null;
};

export async function saveSettings(input: SettingsInput) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  }
  const v = parsed.data;

  const provider =
    v.llmProvider === "lmstudio" || v.llmProvider === "anthropic" ? v.llmProvider : null;

  // Keep only known tool names; null means "all tools allowed".
  const selected = v.enabledTools.filter((n) => KNOWN_TOOLS.includes(n));
  const allSelected = KNOWN_TOOLS.every((n) => selected.includes(n));

  const patch: Record<string, unknown> = {
    llmProvider: provider,
    llmModel: emptyToNull(v.llmModel),
    llmBaseUrl: emptyToNull(v.llmBaseUrl),
    skillsMd: emptyToNull(v.skillsMd),
    workingDir: emptyToNull(v.workingDir),
    enabledTools: allSelected ? null : selected,
  };
  // Blank API key → leave the existing one untouched.
  if (v.llmApiKey.trim()) patch.llmApiKey = v.llmApiKey.trim();

  await updateAppSettings(db, patch);
  revalidatePath("/settings");
  return { ok: true as const };
}
