import { ProgressDay } from "./achievements";
import { dayNum, dayStr, dayWork, weekMonday, weekOf } from "./streak";

/** Beans every room of the café gets for each week the quest was met. */
export const QUEST_BEANS = 100;
/** The smallest weekly goal, in actions. */
export const QUEST_MIN = 100;
const LOOK_BACK = 4;

function weekTotals(days: ProgressDay[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const d of days) {
    const w = weekOf(dayNum(d.day));
    m.set(w, (m.get(w) ?? 0) + dayWork(d));
  }
  return m;
}

/** A tenth more than the café's usual week of late, rounded to fifty; the weeks before set it, so it never moves. */
function goalOf(totals: Map<number, number>, w: number): number {
  const past = Array.from({ length: LOOK_BACK }, (_, i) => totals.get(w - 1 - i) ?? 0).filter((n) => n > 0);
  const usual = past.length ? past.reduce((s, n) => s + n, 0) / past.length : 0;
  return Math.max(QUEST_MIN, Math.ceil((usual * 1.1) / 50) * 50);
}

export interface WeekQuest {
  goal: number;
  done: number;
  /** Monday and Sunday of the week */
  from: string;
  to: string;
}

/** This week's shared goal: questions and tool calls of the whole café together. */
export function weekQuest(days: ProgressDay[], today: string): WeekQuest {
  const totals = weekTotals(days);
  const w = weekOf(dayNum(today));
  const from = weekMonday(w);
  return { goal: goalOf(totals, w), done: totals.get(w) ?? 0, from: dayStr(from), to: dayStr(from + 6) };
}

/** The weeks ending after `fromDay` in which the café met its goal, the running week included once it has. */
export function questsWon(days: ProgressDay[], fromDay: string): number {
  const totals = weekTotals(days);
  const from = dayNum(fromDay);
  let won = 0;
  for (const [w, n] of totals) if (weekMonday(w) + 6 > from && n >= goalOf(totals, w)) won++;
  return won;
}

export interface Barista {
  name: string;
  work: number;
}

/** Teammates by what their agents did this week, busiest first; nobody who did nothing. */
export function baristas(members: Record<string, ProgressDay[]>, today: string): Barista[] {
  const w = weekOf(dayNum(today));
  return Object.entries(members)
    .map(([name, days]) => ({
      name,
      work: days.filter((d) => weekOf(dayNum(d.day)) === w).reduce((s, d) => s + dayWork(d), 0),
    }))
    .filter((b) => b.work > 0)
    .sort((a, b) => b.work - a.work || a.name.localeCompare(b.name, "uk"));
}
