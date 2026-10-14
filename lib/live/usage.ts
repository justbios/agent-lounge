import { ContextFill, LimitWindow, Limits, LiveEvent, Usage } from "./types";

export const ZERO_USAGE: Usage = { in: 0, cw: 0, cr: 0, out: 0 };

export const tokensOf = (u: Usage | undefined): number => (u ? u.in + u.cw + u.cr + u.out : 0);

/** How full a context is, 0–1; without the window's size, a chat past 200k must have the long one. */
export function fillOf(c: ContextFill): number {
  const size = c.size ?? (c.used > 200_000 ? 1_000_000 : 200_000);
  return Math.min(1, c.used / size);
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
}

const FIVE_HOURS_MS = 5 * 3600 * 1000;

/** The freshest limits each teammate's status line reported, and a limit Claude ran into since, freshest first. */
export function latestLimits(events: LiveEvent[]): MemberLimits[] {
  const by = new Map<string, MemberLimits>();
  const answered = new Map<string, number>();
  for (const e of events) {
    const who = e.member ?? "";
    if (e.kind === "stop" && !e.err) answered.set(who, e.at);
    if (!e.limits && e.err !== "rate_limit") continue;
    const m = by.get(who) ?? { member: who };
    by.set(who, m);
    if (e.limits && (!m.limits || e.limits.at >= m.limits.at)) m.limits = e.limits;
    if (e.err === "rate_limit" && e.at > (m.hit ?? 0)) m.hit = e.at;
  }
  for (const m of by.values()) if (m.hit && (answered.get(m.member) ?? 0) > m.hit) delete m.hit;
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
