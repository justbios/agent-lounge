import fs from "node:fs";
import path from "node:path";
import { KEEP, thinFeed } from "./thin";
import { LiveEvent } from "./types";

/** thinning walks the whole feed, so it waits for this many spare events instead of running on every one */
const SLACK = 200;
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
    const all = lines.map((l) => JSON.parse(l) as LiveEvent).sort((a, b) => a.seq - b.seq);
    const keep = thinFeed(all);
    if (keep.length < all.length) fs.writeFileSync(FILE, keep.map((e) => JSON.stringify(e)).join("\n") + "\n");
    return keep;
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
  if (s.events.length > KEEP.tools + KEEP.story + SLACK) s.events = thinFeed(s.events);
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

const LOCAL_SCRIPTS = new Set(["live", "live:dev"]);

/**
 * The live feed is for a server on this machine only: `npm run live`, `npm run up` (RELAY_LOCAL=1) or a dev server.
 * Any other deploy, hosted or self-hosted, has it off, so a public server never takes hooks or hands out the feed.
 */
export function liveEnabled(): boolean {
  if (process.env.VERCEL) return false;
  return (
    process.env.RELAY_LOCAL === "1" ||
    process.env.NODE_ENV === "development" ||
    LOCAL_SCRIPTS.has(process.env.npm_lifecycle_event ?? "")
  );
}

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/;

/**
 * A request the local café may serve: addressed to this machine by name (a web page whose own domain was pointed at
 * 127.0.0.1 is refused) and not sent by some other site's page. Hooks send no Origin; the café's own page sends its
 * own.
 */
export function localRequest(req: Request): boolean {
  if (!liveEnabled() || !LOOPBACK.test(req.headers.get("host") ?? "")) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin);
    return (o.protocol === "http:" || o.protocol === "https:") && LOOPBACK.test(o.host);
  } catch {
    return false;
  }
}
