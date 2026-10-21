"use client";

import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import { tr, uiNow } from "@/lib/i18n";
import { chime } from "./chime";
import { LiveSession } from "./liveModel";
import { line, speechNow } from "./speech";
import { Stuck, stuckBySession, stuckLong } from "./stuck";
import { LiveEvent } from "./types";
import { pageNotify, useAlertPrefs } from "./useAlerts";

/** how often the café looks again: lateness grows with the clock, loops with the events */
const LOOK_MS = 15_000;

const keyOf = (session: string, s: Stuck) => `${session}:${s.agent}:${s.kind}:${s.e?.seq ?? s.at}`;

/**
 * Every chat's stuck agents, by chat id; one that turns stuck while the café is open rings once and, with
 * notifications or push on, says so from the page: no push comes for it, since nothing new reaches the server.
 */
export function useStuck(
  events: LiveEvent[],
  now: number,
  sessions: LiveSession[],
  pushOn: boolean,
): Map<string, Stuck[]> {
  const p = useAlertPrefs();
  const tick = Math.floor(now / LOOK_MS);
  const stuck = useMemo(
    () => (tick ? stuckBySession(events, tick * LOOK_MS) : new Map<string, Stuck[]>()),
    [events, tick],
  );
  const told = useRef<Set<string> | null>(null);

  const ring = useEffectEvent((found: Map<string, Stuck[]>) => {
    const first = !told.current;
    told.current ??= new Set();
    const mine = new Map(sessions.map((s) => [s.id, s]));
    for (const [id, list] of found) {
      for (const s of list) {
        const key = keyOf(id, s);
        // one loop is one warning, however long it lasts or grows
        const loop = s.kind === "loop" ? [...told.current].some((k) => k.startsWith(`${id}:${s.agent}:loop:`)) : false;
        if (told.current.has(key)) continue;
        told.current.add(key);
        const chat = mine.get(id);
        if (first || loop || !chat) continue;
        if (p.sound) chime("stuck");
        if (p.desktop || pushOn) {
          const ui = uiNow();
          const who = s.e?.agentType ?? "Claude";
          const title =
            s.kind === "loop"
              ? tr(ui, `${who} ходить по колу`, `${who} is going in circles`)
              : tr(ui, "Робота затягнулась", "The job is running late");
          const what = s.e ? line(s.e, speechNow(), s.e.kind) : "";
          pageNotify(title, `${chat.label} · ${stuckLong(s, what, ui)}`, `relay-stuck-${id}`);
        }
      }
    }
    // a loop that ended may come back later as a new one
    for (const k of [...told.current]) {
      const [id, agent, kind] = k.split(":");
      if (kind === "loop" && !found.get(id)?.some((s) => s.agent === agent && s.kind === "loop"))
        told.current.delete(k);
    }
  });
  useEffect(() => {
    if (tick) ring(stuck);
  }, [stuck, tick]);
  return stuck;
}
