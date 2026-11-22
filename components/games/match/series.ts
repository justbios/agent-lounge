"use client";

import { useSyncExternalStore } from "react";
import type { Match } from "@/lib/live/duel";
import { playersOf } from "@/lib/live/duel";
import type { Outcome } from "./table";

/*
 * The score of this sitting: game after game against the same rival at the same game, kept while the page is open
 * and nowhere else. It is what «ще раз» plays for.
 */

export interface Series {
  won: number;
  lost: number;
  drawn: number;
}

const NONE: Series = { won: 0, lost: 0, drawn: 0 };
const scores = new Map<string, Series>();
const counted = new Set<string>();
const listeners = new Set<() => void>();

/** What a sitting is kept under: the game and who else plays it, whichever seats they take. */
export const seriesKey = (m: Match, self: string): string =>
  `${m.kind}|${playersOf(m)
    .map((p) => p.id)
    .filter((id) => id !== self)
    .sort()
    .join("|")}`;

/** One more game of the sitting played to the end; a match counts once however often this is called for it. */
export function recordSeries(key: string, game: string, outcome: Outcome) {
  if (counted.has(game)) return;
  counted.add(game);
  const was = scores.get(key) ?? NONE;
  scores.set(key, { ...was, [outcome]: was[outcome] + 1 });
  listeners.forEach((l) => l());
}

/** This sitting's score against that rival at that game. */
export function useSeries(key: string): Series {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => scores.get(key) ?? NONE,
    () => NONE,
  );
}
