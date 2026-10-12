import { LiveEvent } from "./types";

const MAX_EVENTS = 6000;

interface Store {
  seq: number;
  events: LiveEvent[];
  subs: Set<(e: LiveEvent) => void>;
}

const g = globalThis as typeof globalThis & { __relayLive?: Store };

/** In-process store: survives hot reloads, never leaves this machine, gone on restart. */
export function liveStore(): Store {
  g.__relayLive ??= { seq: 0, events: [], subs: new Set() };
  return g.__relayLive;
}

export function nextSeq(): number {
  const s = liveStore();
  s.seq += 1;
  return s.seq;
}

export function publish(e: LiveEvent) {
  const s = liveStore();
  s.events.push(e);
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
  for (const fn of s.subs) fn(e);
}

export function subscribe(fn: (e: LiveEvent) => void): () => void {
  const s = liveStore();
  s.subs.add(fn);
  return () => {
    s.subs.delete(fn);
  };
}

/** The live feed is for the local `npm run live` server only; a hosted deploy has no single process to hold it. */
export function liveEnabled(): boolean {
  return !process.env.VERCEL;
}
