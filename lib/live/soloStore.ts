"use client";

import { useSyncExternalStore } from "react";
import type { DuelKind } from "./duel";
import { Level, isLevel } from "./solo";

/*
 * What solo play keeps in this browser and nowhere else: the level picked, the tally against the agents, and whether
 * an agent is thinking over a move right now (for anything on screen that wants to show it).
 */

const LEVEL_KEY = "relay.solo.level";
const TALLY_KEY = "relay.solo.tally";

type Listener = () => void;
const store = <T>(read: () => T) => {
  const listeners = new Set<Listener>();
  let value: T | undefined;
  return {
    get: (): T => (value ??= read()),
    set(v: T) {
      value = v;
      listeners.forEach((l) => l());
    },
    subscribe(cb: Listener) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
};

const level = store<Level>(() => {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    return isLevel(v) ? v : "normal";
  } catch {
    return "normal";
  }
});

/** Sets the level agents play at, kept for next time. */
export function setSoloLevel(v: Level) {
  level.set(v);
  try {
    localStorage.setItem(LEVEL_KEY, v);
  } catch {}
}

/** The level agents play at in this browser. */
export function useSoloLevel(): Level {
  return useSyncExternalStore<Level>(level.subscribe, level.get, () => "normal");
}

export interface Tally {
  won: number;
  lost: number;
  drawn: number;
}
export type Result = keyof Tally;
type Tallies = Partial<Record<DuelKind, Tally>>;

const NONE: Tallies = {};
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

const tallies = store<Tallies>(() => {
  try {
    const raw = JSON.parse(localStorage.getItem(TALLY_KEY) ?? "{}") as Record<string, Partial<Tally> | null>;
    const out: Tallies = {};
    for (const [k, t] of Object.entries(raw ?? {})) {
      if (t) out[k as DuelKind] = { won: count(t.won), lost: count(t.lost), drawn: count(t.drawn) };
    }
    return out;
  } catch {
    return {};
  }
});

/** One more game against an agent played to the end: kept here only, never on the café's leaderboard. */
export function recordSolo(kind: DuelKind, result: Result) {
  const all = tallies.get();
  const was = all[kind] ?? { won: 0, lost: 0, drawn: 0 };
  const next = { ...all, [kind]: { ...was, [result]: was[result] + 1 } };
  tallies.set(next);
  try {
    localStorage.setItem(TALLY_KEY, JSON.stringify(next));
  } catch {}
}

/** You against the agents, game by game, in this browser. */
export function useSoloTally(): Tallies {
  return useSyncExternalStore(tallies.subscribe, tallies.get, () => NONE);
}

/** An agent looking for its move on a board: whose game, which seat, and since when (`performance.now()`). */
export interface Thinking {
  game: string;
  by: string;
  since: number;
}

const thinking = store<Thinking | null>(() => null);
let now: Thinking | null = null;

export function setBotThinking(v: Thinking | null) {
  if (v === now) return;
  now = v;
  thinking.set(v);
}

/** The agent thinking right now, outside React: canvas drawing, timers. */
export const botThinking = (): Thinking | null => now;
/** Calls back whenever an agent starts or stops thinking; returns how to stop listening. */
export const onBotThinking = (cb: Listener): (() => void) => thinking.subscribe(cb);

/** The agent thinking over its move right now, or null; with `game`, only in that match. */
export function useBotThinking(game?: string): Thinking | null {
  const t = useSyncExternalStore(
    thinking.subscribe,
    () => now,
    () => null,
  );
  return t && (!game || t.game === game) ? t : null;
}
