import { LimitWindow, Limits, LiveEvent, Usage } from "./types";

export const ZERO_USAGE: Usage = { in: 0, cw: 0, cr: 0, out: 0 };

export const tokensOf = (u: Usage | undefined): number => (u ? u.in + u.cw + u.cr + u.out : 0);

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
  limits: Limits;
}

/** The freshest limits each teammate's status line reported, freshest first. */
export function latestLimits(events: LiveEvent[]): MemberLimits[] {
  const by = new Map<string, MemberLimits>();
  for (const e of events) {
    if (!e.limits) continue;
    const m = e.member ?? "";
    const prev = by.get(m);
    if (!prev || e.limits.at >= prev.limits.at) by.set(m, { member: m, limits: e.limits });
  }
  return [...by.values()].sort((a, b) => b.limits.at - a.limits.at);
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
