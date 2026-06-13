"use client";

/**
 * Lightweight XP / badge toast. Server actions return { xpAwarded, badges };
 * client handlers pass that result to showXpToast(), which dispatches a window
 * event picked up by <XpToaster /> (mounted once in the (app) layout). No
 * external deps, no global state library.
 */
import { useEffect, useState } from "react";

type BadgeUnlock = {
  slug: string;
  name: string;
  iconEmoji: string;
  xpReward: number;
};

// Shaped to accept a server-action result directly (it carries ok/error too);
// only xpAwarded/badges are read.
export type XpAwardLike = {
  ok?: boolean;
  error?: string;
  xpAwarded?: number;
  badges?: BadgeUnlock[];
};

const EVENT = "questvault:xp";

type Toast = { id: number; xp: number; badges: BadgeUnlock[] };

/** Fire-and-forget from a client handler after a server action resolves. */
export function showXpToast(result: XpAwardLike | undefined | null) {
  if (typeof window === "undefined" || !result) return;
  const xp = result.xpAwarded ?? 0;
  const badges = result.badges ?? [];
  if (xp <= 0 && badges.length === 0) return;
  window.dispatchEvent(new CustomEvent<XpAwardLike>(EVENT, { detail: { xpAwarded: xp, badges } }));
}

export function XpToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let seq = 0;
    function onAward(e: Event) {
      const detail = (e as CustomEvent<XpAwardLike>).detail;
      const id = ++seq;
      const toast: Toast = {
        id,
        xp: detail.xpAwarded ?? 0,
        badges: detail.badges ?? [],
      };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    }
    window.addEventListener(EVENT, onAward);
    return () => window.removeEventListener(EVENT, onAward);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-xl border border-brand-200 bg-white px-4 py-3 shadow-lg"
        >
          {t.xp > 0 && (
            <p className="text-sm font-semibold text-brand-600">
              ✦ +{t.xp} XP earned
            </p>
          )}
          {t.badges.map((b) => (
            <p key={b.slug} className="mt-0.5 text-sm text-gray-700">
              <span className="mr-1">{b.iconEmoji}</span>
              Badge unlocked: <span className="font-semibold">{b.name}</span>
              {b.xpReward > 0 && (
                <span className="ml-1 text-brand-600">(+{b.xpReward} XP)</span>
              )}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
