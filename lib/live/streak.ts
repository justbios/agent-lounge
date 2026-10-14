import { ProgressDay } from "./achievements";

const DAY_MS = 86_400_000;
/** Weeks the heat map shows, this one included. */
export const MAP_WEEKS = 26;

export const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
export const dayStr = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
/** Monday-based week number: 1970-01-01 was a Thursday. */
export const weekOf = (n: number) => Math.floor((n + 3) / 7);
/** The Monday that starts week `w`. */
export const weekMonday = (w: number) => w * 7 - 3;

/** How much got done in a day: questions asked and tool calls made. */
export const dayWork = (d: ProgressDay) => d.prompts + d.tools;

export interface Streak {
  /** active days in the current run */
  days: number;
  /** the days the run skipped over, at most one in any Monday–Sunday week */
  frozen: string[];
  /** whether this week's one free skip is still unused */
  freezeLeft: boolean;
  /** whether today already counts; a run is not broken by a today that has not started yet */
  today: boolean;
}

/**
 * The run of days with any agent at work that reaches up to today. One missed day per calendar week is forgiven, so a
 * day off does not reset the run; a second miss in the same week, or two in a row, ends it.
 */
export function currentStreak(days: ProgressDay[], today: string): Streak {
  const active = new Set(days.filter((d) => dayWork(d) > 0).map((d) => dayNum(d.day)));
  const t = dayNum(today);
  const frozenWeeks = new Set<number>();
  const frozen: string[] = [];
  let count = 0;
  let n = active.has(t) ? t : t - 1;
  for (;;) {
    if (active.has(n)) {
      count++;
    } else {
      if (frozenWeeks.has(weekOf(n)) || !active.has(n - 1)) break;
      frozenWeeks.add(weekOf(n));
      frozen.push(dayStr(n));
    }
    n--;
  }
  return { days: count, frozen, freezeLeft: !frozenWeeks.has(weekOf(t)), today: active.has(t) };
}

export interface Cell {
  day: string;
  work: number;
  /** 0 for nothing, 1–4 by how busy the day was against the busiest days on the map */
  level: number;
  future: boolean;
}

/** {@link MAP_WEEKS} columns of Monday-to-Sunday days, the last one this week, each day graded against the others. */
export function heatWeeks(days: ProgressDay[], today: string): Cell[][] {
  const work = new Map(days.map((d) => [dayNum(d.day), dayWork(d)]));
  const t = dayNum(today);
  const first = weekMonday(weekOf(t) - MAP_WEEKS + 1);
  const seen = [...work.entries()].filter(([n, w]) => n >= first && n <= t && w > 0).map(([, w]) => w);
  const sorted = seen.sort((a, b) => a - b);
  const cut = [0.25, 0.5, 0.75].map((q) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0);
  const level = (w: number) => (w <= 0 ? 0 : 1 + cut.filter((c) => w > c).length);
  return Array.from({ length: MAP_WEEKS }, (_, c) =>
    Array.from({ length: 7 }, (_, r) => {
      const n = first + c * 7 + r;
      const w = work.get(n) ?? 0;
      return { day: dayStr(n), work: w, level: n > t ? 0 : level(w), future: n > t };
    }),
  );
}
