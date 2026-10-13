"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { BET_WINDOW_MS, ChoiceId, Pick, Round, choiceOf, cleanPick, roundsOf, visibleRounds } from "./bets";
import { LiveEvent } from "./types";
import { Scores } from "./useScores";
import { Social } from "./useSocial";

const DONE_KEY = "relay.betsDone";
/** A pick that took this long to arrive after the window closed is too late to count. */
const GRACE_MS = 5000;

type Picks = Record<string, Record<string, Pick & { at: number }>>;

export interface BetRound extends Round {
  picks: [string, Pick][];
  mine: ChoiceId | null;
  open: boolean;
  result: ChoiceId | null;
}

function readDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/**
 * «Ставки»: everyone in the café guesses how long a subagent will work. Picks travel over the social channel; each
 * tab settles its own pick from the same hook events once the subagent stops, so everyone sees the same result.
 */
export function useBets({
  events,
  scope,
  social,
  scores,
  now,
  enabled,
}: {
  events: LiveEvent[];
  /** the chat on screen, or null for the whole team */
  scope: string | null;
  social: Social;
  scores: Scores;
  now: number;
  enabled: boolean;
}): { rounds: BetRound[]; place: (round: string, choice: ChoiceId) => void } {
  const [picks, setPicks] = useState<Picks>({});
  const done = useRef<Set<string> | null>(null);
  const { bus, self, name } = social;

  useEffect(
    () =>
      bus.on("bet", (p) => {
        const x = cleanPick(p);
        if (!x) return;
        const at = Date.now();
        setPicks((prev) => ({ ...prev, [x.round]: { ...prev[x.round], [x.by]: { ...x.pick, at } } }));
      }),
    [bus],
  );

  const all = useMemo(
    () => roundsOf(scope ? events.filter((e) => e.session === scope) : events),
    [events, scope],
  );

  const counted = (r: Round) =>
    Object.entries(picks[r.id] ?? {}).filter(([, p]) => p.at <= r.start + BET_WINDOW_MS + GRACE_MS);

  const settle = useEffectEvent(() => {
    done.current ??= readDone();
    for (const r of all) {
      const mine = picks[r.id]?.[self];
      if (r.end == null || !mine || done.current.has(r.id)) continue;
      done.current.add(r.id);
      try {
        localStorage.setItem(DONE_KEY, JSON.stringify([...done.current].slice(-200)));
      } catch {}
      scores.record(name, "bets", mine.choice === choiceOf(r.end - r.start));
    }
  });
  useEffect(() => {
    if (enabled) settle();
  }, [all, picks, enabled]);

  const rounds: BetRound[] = enabled
    ? visibleRounds(all, now, (id) => Object.keys(picks[id] ?? {}).length > 0).map((r) => ({
        ...r,
        picks: counted(r),
        mine: picks[r.id]?.[self]?.choice ?? null,
        open: r.end == null && now - r.start < BET_WINDOW_MS,
        result: r.end == null ? null : choiceOf(r.end - r.start),
      }))
    : [];

  const place = (round: string, choice: ChoiceId) => {
    const r = all.find((x) => x.id === round);
    if (!r || r.end != null || Date.now() - r.start > BET_WINDOW_MS) return;
    bus.send("bet", { round, choice, by: self, name });
  };

  return { rounds, place };
}
