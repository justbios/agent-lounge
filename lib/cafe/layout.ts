import { Point } from "@/lib/layout";

export const CAFE_W = 384;
export const WALL_H = 50;
export const SEAT_DY = 44;
export const STAND_MS = 320;
export const GIVE_MS = 520;
export const SIT_MS = 280;
export const WALK_PX_PER_MS = 0.03;

const FIRST_BAND = 66;
const BAND_STEP = 82;
const JITTER = 5;
const SIDE_STEP = 15;
const MIN_GAP = 62;
const DESK_HALF = 24;
/** the bar and stools on the left and the vending machine on the right eat into the first band */
const FIRST_SPAN: [number, number] = [72, 326];
const SPAN: [number, number] = [34, 352];

export type Dir = "up" | "down" | "left" | "right";

export interface Desk {
  x: number;
  top: number;
  row: number;
}

export interface CafeLayout {
  desks: Desk[];
  /** nominal top of each band of desks */
  bands: number[];
  /** the aisle each band's people walk along, just behind its chairs */
  walkY: number[];
  width: number;
  height: number;
}

export function rng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bandCap(seed: number, band: number): number {
  return 2 + Math.floor(rng(seed * 31 + band * 7919)() * 3);
}

function fits(xs: number[], x: number): boolean {
  return xs.every((o) => Math.abs(o - x) >= MIN_GAP);
}

function pickX(xs: number[], span: [number, number], r: () => number): number | null {
  for (let k = 0; k < 40; k++) {
    const x = Math.round(span[0] + r() * (span[1] - span[0]));
    if (fits(xs, x)) return x;
  }
  let best: number | null = null;
  let bestGap = MIN_GAP - 1;
  for (let x = span[0]; x <= span[1]; x += 2) {
    const gap = Math.min(...xs.map((o) => Math.abs(o - x)));
    if (gap > bestGap) {
      bestGap = gap;
      best = x;
    }
  }
  return best;
}

/**
 * Desks scattered through the room in loose bands. Each desk depends only on the seed and the desks
 * before it, so a live café that gains an agent never reshuffles the ones already sitting.
 */
export function cafeLayout(n: number, seed = 1): CafeLayout {
  const desks: Desk[] = [];
  const bandXs: number[][] = [];
  const full: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const r = rng(seed * 1009 + i * 7349 + 17);
    let placed = false;
    while (!placed) {
      const open = bandXs.map((xs, b) => b).filter((b) => !full[b] && bandXs[b].length < bandCap(seed, b));
      if (!open.length) {
        bandXs.push([]);
        full.push(false);
        continue;
      }
      const b = open[Math.floor(r() * open.length)];
      const x = pickX(bandXs[b], b === 0 ? FIRST_SPAN : SPAN, r);
      if (x == null) {
        full[b] = true;
        continue;
      }
      bandXs[b].push(x);
      const top = FIRST_BAND + b * BAND_STEP + Math.round((r() * 2 - 1) * JITTER);
      desks.push({ x, top, row: b });
      placed = true;
    }
  }

  const rows = Math.max(1, bandXs.length);
  const bands = Array.from({ length: rows }, (_, b) => FIRST_BAND + b * BAND_STEP);
  const walkY = bands.map((t) => t + SEAT_DY + JITTER + 3);
  return { desks, bands, walkY, width: CAFE_W, height: bands[rows - 1] + 70 };
}

function laneFree(lay: CafeLayout, x: number, lo: number, hi: number): boolean {
  return lay.desks.every((d) => d.row <= lo || d.row > hi || Math.abs(d.x - x) >= DESK_HALF);
}

/** An x where someone can cross from one aisle to another without walking through a desk. */
export function crossingX(lay: CafeLayout, fromX: number, toX: number, ra: number, rb: number): number {
  const lo = Math.min(ra, rb);
  const hi = Math.max(ra, rb);
  let best = 6;
  let bestCost = Infinity;
  for (let x = 6; x <= lay.width - 6; x += 2) {
    if (!laneFree(lay, x, lo, hi)) continue;
    const cost = Math.abs(fromX - x) + Math.abs(x - toX);
    if (cost < bestCost) {
      bestCost = cost;
      best = x;
    }
  }
  return best;
}

function compact(p: Point[]): Point[] {
  return p.filter((q, i) => i === 0 || q.x !== p[i - 1].x || q.y !== p[i - 1].y);
}

/** Aisle-to-aisle route between two floor points that each sit on a band's aisle. */
export function route(lay: CafeLayout, a: Point, ra: number, b: Point, rb: number): Point[] {
  const ya = lay.walkY[ra];
  const yb = lay.walkY[rb];
  if (ra === rb) return compact([a, { x: a.x, y: ya }, { x: b.x, y: ya }, b]);
  const lane = crossingX(lay, a.x, b.x, ra, rb);
  return compact([a, { x: a.x, y: ya }, { x: lane, y: ya }, { x: lane, y: yb }, { x: b.x, y: yb }, b]);
}

/** Walking route from beside one agent's chair to beside another's. */
export function handoffPath(lay: CafeLayout, from: number, to: number): Point[] {
  const a = lay.desks[from];
  const b = lay.desks[to];
  const out = b.x >= a.x ? 1 : -1;
  const start = { x: a.x + out * SIDE_STEP, y: a.top + SEAT_DY };
  const via = a.row === b.row ? start.x : crossingX(lay, start.x, b.x, a.row, b.row);
  const side = via < b.x ? -1 : 1;
  const end = { x: b.x + side * SIDE_STEP, y: b.top + SEAT_DY };
  return route(lay, start, a.row, end, b.row);
}

function segLen(a: Point, b: Point): number {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
}

export function pathLength(p: Point[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += segLen(p[i - 1], p[i]);
  return s;
}

function dirOf(a: Point, b: Point): Dir {
  if (b.x > a.x) return "right";
  if (b.x < a.x) return "left";
  return b.y > a.y ? "down" : "up";
}

export function pointAt(p: Point[], dist: number): { x: number; y: number; dir: Dir } {
  let rest = Math.max(0, dist);
  for (let i = 1; i < p.length; i++) {
    const seg = segLen(p[i - 1], p[i]);
    if (seg === 0) continue;
    if (rest <= seg || i === p.length - 1) {
      const t = Math.min(1, rest / seg);
      return {
        x: p[i - 1].x + (p[i].x - p[i - 1].x) * t,
        y: p[i - 1].y + (p[i].y - p[i - 1].y) * t,
        dir: dirOf(p[i - 1], p[i]),
      };
    }
    rest -= seg;
  }
  const last = p[p.length - 1];
  return { x: last.x, y: last.y, dir: "down" };
}

export function cafeTravelMs(lay: CafeLayout, i: number): number {
  const walk = pathLength(handoffPath(lay, i, i + 1)) / WALK_PX_PER_MS;
  return STAND_MS + Math.round(walk) + GIVE_MS;
}
