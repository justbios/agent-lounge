import { ContextFill, LimitWindow, Limits, LiveEvent, Usage } from "./types";

export const ZERO_USAGE: Usage = { in: 0, cw: 0, cr: 0, out: 0 };

export const tokensOf = (u: Usage | undefined): number => (u ? u.in + u.cw + u.cr + u.out : 0);

/** The context window's size; without the status line's word, a chat past 200k must have the long one. */
export const sizeOf = (c: ContextFill): number => c.size ?? (c.used > 200_000 ? 1_000_000 : 200_000);

/** How full a context is, 0–1. */
export function fillOf(c: ContextFill): number {
  return Math.min(1, c.used / sizeOf(c));
}

export function addUsage(a: Usage, b: Usage | undefined): Usage {
  return b ? { in: a.in + b.in, cw: a.cw + b.cw, cr: a.cr + b.cr, out: a.out + b.out } : a;
}

/** Everything the given events spent. */
export function sumUsage(events: LiveEvent[]): Usage {
  return events.reduce((s, e) => addUsage(s, e.usage), ZERO_USAGE);
}

/** Tokens a minute over the last `windowMs`; reports arrive in bursts at the end of each answer, so the window is wide. */
export function tokenRate(events: LiveEvent[], now: number, windowMs = 15 * 60 * 1000): number {
  let sum = 0;
  for (let i = events.length - 1; i >= 0 && events[i].at > now - windowMs; i--) sum += tokensOf(events[i].usage);
  return sum / (windowMs / 60000);
}

export interface MemberLimits {
  /** the teammate's name, "" for a Claude without one */
  member: string;
  /** the 5-hour and weekly windows as the status line last saw them */
  limits?: Limits;
  /** when Claude last broke off on the subscription limit with nothing answered since, ms */
  hit?: number;
  /** how fast each window fills, from the snapshots the status line sent */
  pace?: { five?: Pace; week?: Pace };
}

export interface Pace {
  /** percent of the window spent an hour */
  perHour: number;
  /** measured over the last hour of snapshots; otherwise averaged over the window so far */
  recent: boolean;
}

const HOUR_MS = 3600 * 1000;
const FIVE_HOURS_MS = 5 * HOUR_MS;
const WINDOW_MS = { five: FIVE_HOURS_MS, week: 7 * 24 * HOUR_MS };
/** the shortest stretch a pace is measured over: the 5-hour one, and the week, which sleeps at night */
const MIN_SPAN_MS = { five: 10 * 60 * 1000, week: 6 * HOUR_MS };
/** two snapshots belong to one window when their resets differ by less than this, seconds */
const SAME_WINDOW_S = 600;
/** a pace from the last hour stops counting once no snapshot came for this long: Claude is resting */
const RESTING_MS = 30 * 60 * 1000;

/**
 * How fast a window fills: for the 5-hour one, over the last hour of snapshots when there is one; otherwise, and
 * always for the week, the window's whole share so far over the time since it began.
 */
function paceOf(snaps: Limits[], which: "five" | "week"): Pace | undefined {
  const last = snaps.at(-1);
  const w = last?.[which];
  if (!last || !w) return undefined;
  if (which === "five") {
    const first = snaps.find(
      (s) => s.five && Math.abs(s.five.reset - w.reset) < SAME_WINDOW_S && (last.at - s.at) * 1000 <= HOUR_MS,
    );
    const span = first ? (last.at - first.at) * 1000 : 0;
    if (first?.five && span >= MIN_SPAN_MS.five) {
      return { perHour: Math.max(0, w.pct - first.five.pct) / (span / HOUR_MS), recent: true };
    }
  }
  const since = last.at * 1000 - (w.reset * 1000 - WINDOW_MS[which]);
  return since >= MIN_SPAN_MS[which] ? { perHour: w.pct / (since / HOUR_MS), recent: false } : undefined;
}

/** The freshest limits each teammate's status line reported, and a limit Claude ran into since, freshest first. */
export function latestLimits(events: LiveEvent[]): MemberLimits[] {
  const by = new Map<string, MemberLimits>();
  const answered = new Map<string, number>();
  const snaps = new Map<string, Map<number, Limits>>();
  for (const e of events) {
    const who = e.member ?? "";
    if (e.kind === "stop" && !e.err) answered.set(who, e.at);
    if (!e.limits && e.err !== "rate_limit") continue;
    const m = by.get(who) ?? { member: who };
    by.set(who, m);
    if (e.limits && (!m.limits || e.limits.at >= m.limits.at)) m.limits = e.limits;
    if (e.limits) snaps.set(who, (snaps.get(who) ?? new Map()).set(e.limits.at, e.limits));
    if (e.err === "rate_limit" && e.at > (m.hit ?? 0)) m.hit = e.at;
  }
  for (const m of by.values()) {
    if (m.hit && (answered.get(m.member) ?? 0) > m.hit) delete m.hit;
    const seen = [...(snaps.get(m.member)?.values() ?? [])].sort((a, b) => a.at - b.at);
    const five = paceOf(seen, "five");
    const week = paceOf(seen, "week");
    if (five || week) m.pace = { five, week };
  }
  const seen = (m: MemberLimits) => Math.max((m.limits?.at ?? 0) * 1000, m.hit ?? 0);
  return [...by.values()].filter((m) => m.limits || m.hit).sort((a, b) => seen(b) - seen(a));
}

/** When Claude ran into the limit, while that still stands: no fresher limits since, and within five hours. */
export function hitNow(m: MemberLimits, now: number): number | null {
  if (!m.hit || now - m.hit > FIVE_HOURS_MS) return null;
  return m.limits && m.limits.at * 1000 > m.hit ? null : m.hit;
}

export interface WindowNow {
  pct: number;
  /** epoch ms of the next reset */
  reset: number;
  /** the reset already passed since the status line saw it, so the window starts empty */
  rolled: boolean;
}

/** Where a limit window stands now: as last seen, or empty once its reset time has passed. */
export function windowNow(w: LimitWindow | undefined, now: number): WindowNow | null {
  if (!w) return null;
  const reset = w.reset * 1000;
  return reset <= now ? { pct: 0, reset, rolled: true } : { pct: Math.min(100, w.pct), reset, rolled: false };
}

export interface Forecast {
  /** where the window would stand at its reset at this pace, 0–100 */
  atReset: number;
  /** epoch ms it runs out at this pace, when that comes before the reset */
  out: number | null;
}

/** Where a window is headed if Claude keeps its pace; nothing once it reset, ran out, or Claude is resting. */
export function forecast(m: MemberLimits, which: "five" | "week", now: number): Forecast | null {
  const w = m.limits?.[which];
  const pace = m.pace?.[which];
  if (!w || !pace || pace.perHour <= 0 || w.pct >= 100) return null;
  const seen = m.limits!.at * 1000;
  const reset = w.reset * 1000;
  if (reset <= now || (pace.recent && now - seen > RESTING_MS)) return null;
  const out = seen + ((100 - w.pct) / pace.perHour) * HOUR_MS;
  return {
    atReset: Math.min(100, w.pct + (pace.perHour * (reset - seen)) / HOUR_MS),
    out: out < reset ? Math.max(out, now) : null,
  };
}
