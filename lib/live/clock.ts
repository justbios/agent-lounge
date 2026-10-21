"use client";

import { useSyncExternalStore } from "react";
import { Side, isClock } from "./duel";

/*
 * Clocks for chess and draughts, as in blitz: each side has the same time for the whole game, it runs only while that
 * side is to move, and whoever runs out first loses. Each screen times its own player's moves and sends each move's
 * cost with it, so the delay on the way is never charged to anyone. White's first move is free; the clocks start
 * once it is made.
 */

/**
 * how far past zero the other side's clock may run here before this screen calls it: their own screen calls it first,
 * and their last move may still be on its way
 */
export const GRACE_MS = 3000;
/** below this a clock shows tenths, turns red, and ticks for its own player */
export const LOW_MS = 10_000;

export interface Clock {
  /** ms on each side's clock at the start */
  limit: number;
  /** what each move cost the side that made it, ms by that side's own screen */
  spent: number[];
  /** when the side to move started thinking, by this screen's `performance.now()`; -1 until the first move */
  since: number;
  /** the side whose time ran out */
  out: Side | null;
}

/** who made move `i`: white (x) moves first */
export const sideAt = (i: number): Side => (i % 2 ? "o" : "x");

export function newClock(seconds: number | undefined): Clock | null {
  return seconds && isClock(seconds) ? { limit: seconds * 1000, spent: [], since: -1, out: null } : null;
}

/** Ms left on `side`'s clock at `now`; it runs only for the side to move, and stops once the game is over. */
export function left(c: Clock, side: Side, turn: Side, over: boolean, now: number): number {
  let used = 0;
  c.spent.forEach((ms, i) => {
    if (sideAt(i) === side) used += ms;
  });
  if (!over && !c.out && turn === side && c.since >= 0) used += now - c.since;
  return c.limit - used;
}

/** The clock once this side has moved at `now`: the move costs the time since its turn began. */
export function moved(c: Clock, now: number): Clock {
  const cost = c.since < 0 ? 0 : Math.min(c.limit, now - c.since);
  return { ...c, spent: [...c.spent, cost], since: now };
}

/**
 * The clock once moves from `had` on came in from the other side, with what they say each cost; the turn they hand
 * over starts now, here, so the time on the way is not this side's.
 */
export function heard(c: Clock, had: number, moves: number, spent: number[] | null, now: number): Clock {
  const next = c.spent.slice(0, had);
  for (let i = had; i < moves; i++) next.push(Math.min(c.limit, spent?.[i] ?? 0));
  return { ...c, spent: next, since: now };
}

/** A clock's extras on a move message: each move's cost, and whose time ran out; junk reads as nothing. */
export function cleanTimes(p: unknown): { spent: number[] | null; out: Side | null } {
  const m = p as Record<string, unknown> | null;
  const raw = m?.spent;
  const spent =
    Array.isArray(raw) && raw.length <= 1000 && raw.every((v) => typeof v === "number" && v >= 0 && Number.isFinite(v))
      ? (raw as number[])
      : null;
  const out = m?.out === "x" || m?.out === "o" ? m.out : null;
  return { spent, out };
}

/** What a move message carries for the clock, nothing when the game has none. */
export const times = (c: Clock | null) => (c ? { spent: c.spent, ...(c.out ? { out: c.out } : {}) } : {});

/** "2:05" or, under ten seconds, "7.4" */
export function clockText(ms: number): string {
  const v = Math.max(0, ms);
  if (v < LOW_MS) return (Math.floor(v / 100) / 10).toFixed(1);
  const s = Math.ceil(v / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "1 хв", "без годинника": a choice in the picker or on an invite */
export function clockName(seconds: number, t: (uk: string, en: string) => string): string {
  return seconds ? t(`${seconds / 60} хв`, `${seconds / 60} min`) : t("без годинника", "no clock");
}

const KEY = "relay.clock";
const listeners = new Set<() => void>();
let pick: number | null = null;

function readPick(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return isClock(v) ? v : 0;
  } catch {
    return 0;
  }
}

const snap = () => (pick ??= readPick());

/** Sets the clock this browser offers with chess and draughts, kept for next time. */
export function setClockPick(seconds: number) {
  pick = isClock(seconds) ? seconds : 0;
  try {
    localStorage.setItem(KEY, String(pick));
  } catch {}
  listeners.forEach((l) => l());
}

/** The clock this browser offers with chess and draughts, in seconds; 0 for none. */
export function useClockPick(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snap,
    () => 0,
  );
}
