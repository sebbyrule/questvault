"use client";

/**
 * Multi-step first-run setup. Reuses existing actions (createProject,
 * createInvite) and the onboarding actions for the coach-config + finish steps.
 * Each step is skippable except none are required to finish — the goal is to get
 * the admin oriented, not to block them.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { createProject } from "@/lib/actions";
import { createInvite } from "@/lib/member-actions";
import { saveOnboardingCoach, completeOnboarding } from "@/lib/onboarding-actions";

const STEPS = ["Project", "AI coach", "Team", "Done"] as const;

export function OnboardingWizard({
  hasProject,
  adminName,
}: {
  hasProject: boolean;
  adminName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Step 1 — project
  const [projectName, setProjectName] = useState("");
  const [projectCreated, setProjectCreated] = useState(hasProject);

  // Step 2 — coach
  const [provider, setProvider] = useState<"lmstudio" | "anthropic">("lmstudio");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:1234/v1");
  const [apiKey, setApiKey] = useState("");
  const [coachSaved, setCoachSaved] = useState(false);

  // Step 3 — invites
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [invites, setInvites] = useState<{ email: string; url: string }[]>([]);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  function makeProject() {
    setError(null);
    if (!projectName.trim()) {
      setError("Give your project a name.");
      return;
    }
    startTransition(async () => {
      const res = await createProject({ name: projectName });
      if (!res.ok) {
        setError(res.error ?? "Could not create the project");
        return;
      }
      setProjectCreated(true);
      next();
    });
  }

  function saveCoach() {
    setError(null);
    startTransition(async () => {
      const res = await saveOnboardingCoach({ provider, model, baseUrl, apiKey });
      if (!res.ok) {
        setError(res.error ?? "Could not save the coach config");
        return;
      }
      setCoachSaved(true);
      next();
    });
  }

  function addInvite() {
    setError(null);
    if (!inviteEmail.trim()) {
      setError("Enter an email to invite.");
      return;
    }
    startTransition(async () => {
      const res = await createInvite({ email: inviteEmail.trim(), role: inviteRole });
      if (!res.ok) {
        setError(res.error ?? "Could not create the invite");
        return;
      }
      const url = `${window.location.origin}/auth/invite/${res.token}`;
      setInvites((prev) => [...prev, { email: inviteEmail.trim(), url }]);
      setInviteEmail("");
    });
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      const res = await completeOnboarding();
      if (!res.ok) {
        setError(res.error ?? "Could not finish onboarding");
        return;
      }
      router.push("/board");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <p className="text-sm font-medium text-brand-600">Welcome to QuestVault</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Let&apos;s set up your workspace, {adminName}</h1>
      </div>

      {/* Step indicator */}
      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={clsx(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step
                  ? "bg-brand-600 text-white"
                  : i === step
                    ? "bg-brand-100 text-brand-700 ring-2 ring-brand-400"
                    : "bg-gray-100 text-gray-400"
              )}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span className={clsx("text-xs", i === step ? "font-semibold text-gray-700" : "text-gray-400")}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* ── Step 1: Project ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create your first project</h2>
              <p className="mt-1 text-sm text-gray-500">
                Projects hold tickets, sprints, and your board. You can add more later.
              </p>
            </div>
            {projectCreated ? (
              <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-700">
                ✓ You already have a project — you&apos;re good to go.
              </p>
            ) : (
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Mobile App"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            )}
            <div className="flex justify-end gap-2">
              {projectCreated ? (
                <button onClick={next} className="btn-primary">Continue</button>
              ) : (
                <button onClick={makeProject} disabled={pending} className="btn-primary">
                  Create project
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Coach ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Connect the AI coach</h2>
              <p className="mt-1 text-sm text-gray-500">
                The coach reads your work and can create/close tickets. Use a local LM Studio model or an Anthropic key. You can change this in Settings anytime.
              </p>
            </div>
            <div className="flex gap-2">
              {(["lmstudio", "anthropic"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={clsx(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium",
                    provider === p
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {p === "lmstudio" ? "LM Studio (local)" : "Anthropic"}
                </button>
              ))}
            </div>
            {provider === "lmstudio" ? (
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:1234/v1"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            ) : (
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            )}
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === "anthropic" ? "claude-sonnet-4-6 (optional)" : "model name (optional)"}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <div className="flex justify-between">
              <button onClick={back} className="btn-ghost">Back</button>
              <div className="flex gap-2">
                <button onClick={next} className="btn-ghost">Skip</button>
                <button onClick={saveCoach} disabled={pending} className="btn-primary">Save &amp; continue</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Team ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Invite your team</h2>
              <p className="mt-1 text-sm text-gray-500">
                Generate one-time invite links to share. (No email yet — copy the link.)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="flex-1 min-w-[180px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={addInvite} disabled={pending} className="btn-primary">Generate link</button>
            </div>
            {invites.length > 0 && (
              <ul className="space-y-2">
                {invites.map((inv) => (
                  <li key={inv.url} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                    <span className="font-medium text-gray-700">{inv.email}</span>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate font-mono text-gray-500">{inv.url}</code>
                      <button
                        onClick={() => navigator.clipboard?.writeText(inv.url)}
                        className="shrink-0 rounded-md px-2 py-1 font-medium text-brand-600 hover:bg-brand-50"
                      >
                        Copy
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between">
              <button onClick={back} className="btn-ghost">Back</button>
              <button onClick={next} className="btn-primary">Continue</button>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 3 && (
          <div className="space-y-4 text-center">
            <div className="text-4xl">🎉</div>
            <h2 className="text-lg font-semibold text-gray-900">You&apos;re all set</h2>
            <p className="text-sm text-gray-500">
              Head to your board to start creating tickets. Earn XP as you work, and ask the coach for help anytime.
            </p>
            <button onClick={finish} disabled={pending} className="btn-primary w-full">
              Go to my board
            </button>
          </div>
        )}
      </div>

      {step < STEPS.length - 1 && (
        <button onClick={finish} disabled={pending} className="mt-4 text-center text-xs text-gray-400 hover:text-gray-600">
          Skip setup for now
        </button>
      )}
    </div>
  );
}
