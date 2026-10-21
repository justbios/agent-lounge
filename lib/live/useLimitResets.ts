"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { Ui, tr, uiNow } from "@/lib/i18n";
import { chime } from "./chime";
import { pageNotify, useAlertPrefs } from "./useAlerts";
import { MemberLimits, hitNow } from "./usage";

/** A window this full, or one Claude ran into, is worth a ping when it resets; a quiet one resets unnoticed. */
const PING_PCT = 70;
const CHECK_MS = 20_000;

export interface LimitReset {
  which: "five" | "week";
  /** epoch ms */
  at: number;
  /** Claude had run into the limit before it reset */
  hit: boolean;
  /** the other window is still used up, so Claude waits on */
  still?: "five" | "week";
}

export function resetTitle(r: LimitReset, ui: Ui): string {
  return r.which === "five"
    ? tr(ui, "5-годинне вікно почалось заново", "The 5-hour window started over")
    : tr(ui, "Тижневий ліміт почався заново", "The weekly limit started over");
}

export function resetHint(r: LimitReset, ui: Ui): string {
  if (r.still === "week") return tr(ui, "але тижневий ліміт ще вичерпано", "but the weekly limit is still used up");
  if (r.still === "five") return tr(ui, "але 5-годинний ліміт ще вичерпано", "but the 5-hour limit is still used up");
  return r.hit ? tr(ui, "Claude знову може працювати", "Claude can work again") : tr(ui, "знову 0%", "back to 0%");
}

/**
 * Rings, notifies and hands back the reset when one of your limit windows starts over while the café is open. No push
 * comes for it: nothing reaches the server at that moment, so with push on the open page shows the notification.
 */
export function useLimitResets(limits: MemberLimits | null, pushOn: boolean): [LimitReset | null, () => void] {
  const p = useAlertPrefs();
  const [shown, setShown] = useState<LimitReset | null>(null);
  const armed = useRef(new Map<string, LimitReset>());
  const rung = useRef(new Set<string>());
  const since = useRef(0);

  useEffect(() => {
    since.current ||= Date.now();
  }, []);

  // every window worth a ping waits for its reset
  useEffect(() => {
    if (!limits?.limits) return;
    const hit = hitNow(limits, Date.now()) != null;
    for (const which of ["five", "week"] as const) {
      const w = limits.limits[which];
      const key = `${which}:${w?.reset}`;
      if (w && (w.pct >= PING_PCT || hit) && !rung.current.has(key)) {
        armed.current.set(key, { which, at: w.reset * 1000, hit });
      }
    }
  }, [limits]);

  const check = useEffectEvent(() => {
    const now = Date.now();
    for (const [key, r] of armed.current) {
      if (r.at > now) continue;
      armed.current.delete(key);
      rung.current.add(key);
      // a reset from before the café opened is old news
      if (r.at < since.current) continue;
      const other = r.which === "five" ? "week" : "five";
      const o = limits?.limits?.[other];
      const ring: LimitReset = o && o.pct >= 100 && o.reset * 1000 > now ? { ...r, still: other } : r;
      if (p.sound) chime("reset");
      if (p.desktop || pushOn) {
        const ui = uiNow();
        pageNotify(
          tr(ui, "Ліміт скинувся", "Your limit reset"),
          `${resetTitle(ring, ui)}: ${resetHint(ring, ui)}`,
          `relay-limit-${r.which}`,
        );
      }
      setShown(ring);
    }
  });

  useEffect(() => {
    const id = setInterval(check, CHECK_MS);
    return () => clearInterval(id);
  }, []);

  return [shown, useCallback(() => setShown(null), [])];
}
