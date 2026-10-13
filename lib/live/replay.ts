import { LiveEvent } from "./types";

export const REPLAY_SPEED = 10;
const GAP_CAP_MS = 15 * 1000;
const TAIL_MS = 4000;

export interface Replay {
  session: string;
  /** the chat's events with idle gaps squeezed to GAP_CAP_MS, so a day plays in minutes */
  events: LiveEvent[];
  real: number[];
  startedAt: number;
}

export function makeReplay(events: LiveEvent[], session: string, startedAt: number): Replay | null {
  const evs = events.filter((e) => e.session === session);
  if (!evs.length) return null;
  let t = evs[0].at;
  let prev = evs[0].at;
  const squeezed = evs.map((e) => {
    t += Math.min(e.at - prev, GAP_CAP_MS);
    prev = e.at;
    return { ...e, at: t };
  });
  return { session, events: squeezed, real: evs.map((e) => e.at), startedAt };
}

/** How far the replay has got at wall time `now`: the virtual time, how many events are out, and whether it ended. */
export function replayAt(r: Replay, now: number): { vnow: number; shown: number; over: boolean } {
  const vnow = r.events[0].at + (now - r.startedAt) * REPLAY_SPEED;
  let lo = 0;
  let hi = r.events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r.events[mid].at <= vnow) lo = mid + 1;
    else hi = mid;
  }
  return { vnow, shown: Math.max(1, lo), over: vnow > r.events[r.events.length - 1].at + TAIL_MS };
}
