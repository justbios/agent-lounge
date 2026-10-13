import { Point } from "@/lib/layout";
import { CafeLayout, Dir, SEAT_DY, WALK_PX_PER_MS, pathLength, pointAt, route } from "@/lib/cafe/layout";
import { CafeModel, Stint } from "@/lib/cafe/model";
import { REST_MS } from "./idle";
import { rand } from "./pixel";
import { Standing } from "./placement";

export type Errand = "coffee" | "soda" | "couch" | "arcade" | "jukebox";

interface Spot {
  key: string;
  /** the piece it belongs to: both seats of a couch share one */
  group: string;
  seat: number;
  errand: Errand;
  /** where they stand to do it; on a couch, just in front of the seat */
  at: Point;
  /** the aisle they come along */
  band: number;
  face: Dir;
}

export interface Outing {
  group: string;
  seat: number;
  errand: Errand;
  phase: "out" | "there" | "back" | "sip";
  x: number;
  y: number;
  dir: Dir;
  /** 0..1 through the stay */
  progress: number;
  /** someone else sits on the same couch */
  mate: boolean;
}

const SLOT_MS = 120_000;
const LEAVE_MS = 15_000;
const CHANCE = 0.5;
const MIN_STAY_MS = 3000;
const SIP_MS = 25_000;
const SIDE_STEP = 15;
const STAY_MS: Record<Errand, number> = { coffee: 6000, soda: 4000, couch: 30_000, arcade: 22_000, jukebox: 7000 };
const BACK: Record<Dir, Dir> = { left: "right", right: "left", up: "down", down: "up" };

/** The aisle in front of a floor point: the first one at or below it, or the last one. */
function aisleFor(lay: CafeLayout, y: number): number {
  const b = lay.walkY.findIndex((w) => w >= y);
  return b < 0 ? lay.walkY.length - 1 : b;
}

const spotMemo = new WeakMap<Standing[], { lay: CafeLayout; spots: Spot[] }>();

/** Where an idle agent can go: the bar and the drinks machine always, a couch, the arcade and a jukebox once placed. */
export function spotsOf(lay: CafeLayout, furniture: Standing[]): Spot[] {
  const hit = spotMemo.get(furniture);
  if (hit && hit.lay === lay) return hit.spots;
  const floor = (y: number) => Math.min(y, lay.height - 2);
  const bar = { x: 54, y: 104 };
  const vending = { x: lay.width - 18, y: 100 };
  const spots: Spot[] = [
    { key: "bar", group: "bar", seat: 0, errand: "coffee", at: bar, band: 0, face: "left" },
    { key: "vending", group: "vending", seat: 0, errand: "soda", at: vending, band: 0, face: "up" },
  ];
  for (const s of furniture) {
    if (s.layer !== "floor") continue;
    const band = aisleFor(lay, s.bottom);
    if (s.item === "couch") {
      for (const [k, dx] of [[0, -7], [1, 6]]) {
        const at = { x: s.cx + dx, y: floor(s.bottom + 2) };
        spots.push({ key: `${s.pid}#${k}`, group: s.pid, seat: k, errand: "couch", at, band, face: "down" });
      }
    }
    if (s.item === "arcade" || s.item === "jukebox") {
      const at = { x: s.cx, y: floor(s.bottom + 5) };
      spots.push({ key: s.pid, group: s.pid, seat: 0, errand: s.item, at, band, face: "up" });
    }
  }
  spotMemo.set(furniture, { lay, spots });
  return spots;
}

const pathMemo = new WeakMap<CafeLayout, Map<string, { path: Point[]; len: number }>>();

function pathTo(lay: CafeLayout, i: number, s: Spot) {
  let memo = pathMemo.get(lay);
  if (!memo) pathMemo.set(lay, (memo = new Map()));
  const key = `${i}|${s.key}|${s.at.x},${s.at.y}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const d = lay.desks[i];
  const start = { x: d.x + (s.at.x >= d.x ? 1 : -1) * SIDE_STEP, y: d.top + SEAT_DY };
  const path = route(lay, start, d.row, s.at, s.band);
  const out = { path, len: pathLength(path) };
  memo.set(key, out);
  return out;
}

/** Free to wander at `at`: worked before, not working now, and done long enough ago. */
function restedAt(stints: Stint[], at: number): boolean {
  let end = -Infinity;
  for (const s of stints) {
    if (s.start <= at && at < s.end) return false;
    if (s.end <= at) end = Math.max(end, s.end);
  }
  return at - end > REST_MS;
}

function trip(lay: CafeLayout, i: number, s: Spot, start: number, end: number, clock: number): Outing | null {
  const { path, len } = pathTo(lay, i, s);
  const walk = len / WALK_PX_PER_MS;
  const stay = Math.min(STAY_MS[s.errand], end - start - 2 * walk);
  const e = clock - start;
  if (stay < MIN_STAY_MS || e < 0) return null;
  const base = { group: s.group, seat: s.seat, errand: s.errand, progress: 0, mate: false };
  if (e < walk) {
    const p = pointAt(path, e * WALK_PX_PER_MS);
    return { ...base, phase: "out", x: p.x, y: p.y, dir: p.dir };
  }
  if (e < walk + stay) return { ...base, phase: "there", ...s.at, dir: s.face, progress: (e - walk) / stay };
  if (e < 2 * walk + stay) {
    const p = pointAt(path, len - (e - walk - stay) * WALK_PX_PER_MS);
    return { ...base, phase: "back", x: p.x, y: p.y, dir: BACK[p.dir], progress: 1 };
  }
  const sip = s.errand === "coffee" || s.errand === "soda";
  if (sip && e < 2 * walk + stay + SIP_MS) return { ...base, phase: "sip", x: 0, y: 0, dir: "up", progress: 1 };
  return null;
}

/**
 * What every agent with nothing to do is off doing right now. Time runs in two-minute slots; at the start of a slot
 * each agent that has been resting flips a coin, and the ones going out take a free spot each, so nobody shares one.
 * Everything follows from the clock and the stints, so every viewer sees the same agents at the same places.
 */
export function planLeisure(m: CafeModel, lay: CafeLayout, spots: Spot[], clock: number): (Outing | null)[] {
  const out: (Outing | null)[] = m.agents.map(() => null);
  if (!spots.length || clock <= 0) return out;
  const k = Math.floor(clock / SLOT_MS);
  const slot = k * SLOT_MS;
  const taken = new Set<string>();
  const order = m.agents.map((_, i) => i).sort((a, b) => rand(k * 3.7 + a * 1.3) - rand(k * 3.7 + b * 1.3));
  for (const i of order) {
    const stints = m.stints[i] ?? [];
    if (!lay.desks[i] || !stints.some((s) => s.start <= slot) || !restedAt(stints, slot)) continue;
    if (rand(k * 5.3 + i * 2.9) >= CHANCE) continue;
    const free = spots.filter((s) => !taken.has(s.key));
    if (!free.length) break;
    const s = free[Math.floor(rand(k * 1.9 + i * 7.1) * free.length)];
    taken.add(s.key);
    if (stints.some((x) => x.start > slot && x.start <= clock)) continue;
    out[i] = trip(lay, i, s, slot + rand(k * 2.3 + i * 4.7) * LEAVE_MS, slot + SLOT_MS, clock);
  }
  const seated = out.filter((o): o is Outing => o?.errand === "couch" && o.phase === "there");
  for (const o of seated) o.mate = seated.some((p) => p !== o && p.group === o.group);
  return out;
}
