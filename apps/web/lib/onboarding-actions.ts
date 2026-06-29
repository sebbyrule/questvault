"use server";

/**
 * First-run onboarding actions. The wizard reuses existing actions for the
 * heavy lifting (createProject, createInvite); these two cover the coach-config
 * step and marking onboarding done. All admin-gated.
 */
import { db, updateAppSettings } from "@questvault/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "./authz";

const coachSchema = z.object({
  provider: z.enum(["lmstudio", "anthropic"]),
  model: z.string().max(200).optional().default(""),
  baseUrl: z.string().max(500).optional().default(""),
  apiKey: z.string().max(1000).optional().default(""),
});

export type OnboardingCoachInput = z.input<typeof coachSchema>;

const emptyToNull = (s: string): string | null => {
  const t = s.trim();
  return t ? t : null;
};

/** Save the coach/LLM config from the onboarding step (blank key leaves it untouched). */
export async function saveOnboardingCoach(input: OnboardingCoachInput) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Forbidden" };

  const parsed = coachSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid config" };
  }
  const v = parsed.data;

  const patch: Record<string, unknown> = {
    llmProvider: v.provider,
    llmModel: emptyToNull(v.model),
    llmBaseUrl: emptyToNull(v.baseUrl),
  };
  if (v.apiKey.trim()) patch.llmApiKey = v.apiKey.trim();

  await updateAppSettings(db, patch);
  revalidatePath("/settings");
  return { ok: true as const };
}

/** Mark onboarding complete so the (app) layout stops redirecting here. */
export async function completeOnboarding() {
  if (!(await requireAdmin())) return { ok: false as const, error: "Forbidden" };
  await updateAppSettings(db, { onboardingCompletedAt: new Date() });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
