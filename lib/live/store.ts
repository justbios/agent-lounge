import fs from "node:fs";
import path from "node:path";
import { LiveEvent } from "./types";

const MAX_EVENTS = 6000;
const FILE = path.join(process.cwd(), "data", "live-events.jsonl");

interface Store {
  seq: number;
  events: LiveEvent[];
  subs: Set<(e: LiveEvent) => void>;
}

const g = globalThis as typeof globalThis & { __relayLive?: Store };

function load(): LiveEvent[] {
  try {
    const lines = fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean);
    const keep = lines.slice(-MAX_EVENTS);
    if (keep.length < lines.length) fs.writeFileSync(FILE, keep.join("\n") + "\n");
    return keep.map((l) => JSON.parse(l) as LiveEvent).sort((a, b) => a.seq - b.seq);
  } catch {
    return [];
  }
}

/** In-process store, mirrored to data/live-events.jsonl so a restart keeps the café. Never leaves this machine. */
export function liveStore(): Store {
  if (!g.__relayLive) {
    const events = load();
    g.__relayLive = { seq: events.reduce((m, e) => Math.max(m, e.seq), 0), events, subs: new Set() };
  }
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
  fs.mkdir(path.dirname(FILE), { recursive: true }, () => fs.appendFile(FILE, JSON.stringify(e) + "\n", () => {}));
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
