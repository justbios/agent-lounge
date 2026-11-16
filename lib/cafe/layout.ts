import { Point } from "@/lib/layout";

/**
 * The hall seen in 3/4: a back wall with depth, desks grouped in pods of 2+2 that face each other, the counter on the
 * left wall and the lounge on the right. Everything is in the design's native pixels (320×192 for up to eight agents).
 */
/** where the floor starts under the back wall */
export const WALL_H = 66;
/** the desk top of the first row of pods */
const D0 = 101;
const ROW_STEP = 84;
export const POD_W = 70;
const POD_PITCH = 86;
/** the counter's column on the left: the first rug starts here */
const LEFT = 80;
/** the lounge's column on the right */
const RIGHT = 72;
export const STAND_MS = 320;
export const GIVE_MS = 520;
export const SIT_MS = 280;
export const WALK_PX_PER_MS = 0.03;

export type Dir = "up" | "down" | "left" | "right";

/** Which way a seated agent looks: at us from the far side of the desk, or away from us on the near side. */
export type Facing = "front" | "back";

export interface Desk {
  /** the middle of the seat */
  x: number;
  /** the top of the seated agent's head */
  top: number;
  /** the aisle this seat's agent walks out to: the one above its pod for the far row, below for the near row */
  row: number;
  face: Facing;
  pod: number;
  /** 0 on the pod's left, 1 on its right */
  side: 0 | 1;
}

/** Four desks pushed together, two facing two, with a lamp and a plant between them, on their own rug. */
export interface Pod {
  /** left edge of the desk block */
  x: number;
  /** top of the desk block */
  d: number;
  row: number;
  /** how many of its four seats are taken */
  used: number;
}

export interface CafeLayout {
  desks: Desk[];
  pods: Pod[];
  /** the desk top of each row of pods */
  bands: number[];
  /** the aisles: one above the first row of pods, then one below each row */
  walkY: number[];
  width: number;
  height: number;
  /** the inside of the front wall: the floor ends here */
  front: number;
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

/** Two pods a row up to eight agents, three after that; the room widens for the third. */
const podsPerRow = (n: number) => (n > 8 ? 3 : 2);

/** The room widens past eight agents so a third pod fits between the counter and the lounge. */
export function cafeWidth(n: number): number {
  return LEFT - 4 + POD_PITCH * podsPerRow(n) + RIGHT;
}

/**
 * Pods of four, filled one at a time: first the far row that faces us, then the near row. A pod that is not the
 * last row's only one keeps its place as the café gains agents; a lone pod or a short last row is centred.
 */
export function cafeLayout(n: number, seed = 1): CafeLayout {
  void seed;
  const width = cafeWidth(n);
  const per = podsPerRow(n);
  const count = Math.max(1, Math.ceil(n / 4));
  const rows = Math.ceil(count / per);
  const pods: Pod[] = [];
  for (let k = 0; k < count; k++) {
    const row = Math.floor(k / per);
    const col = k % per;
    const inRow = Math.min(per, count - row * per);
    const x = LEFT + 6 + col * POD_PITCH + ((per - inRow) * POD_PITCH) / 2;
    pods.push({ x, d: D0 + row * ROW_STEP, row, used: Math.max(0, Math.min(4, n - k * 4)) });
  }
  const desks: Desk[] = [];
  for (let i = 0; i < n; i++) {
    const p = pods[Math.floor(i / 4)];
    const s = i % 4;
    const side = (s % 2) as 0 | 1;
    const far = s < 2;
    desks.push({
      x: p.x + 15 + side * 40,
      top: far ? p.d - 12 : p.d + 19,
      row: far ? p.row : p.row + 1,
      face: far ? "front" : "back",
      pod: Math.floor(i / 4),
      side,
    });
  }
  const bands = Array.from({ length: rows }, (_, r) => D0 + r * ROW_STEP);
  const walkY = [D0 - 24, ...bands.map((d) => d + 57)];
  const front = bands[rows - 1] + 83;
  return { desks, pods, bands, walkY, width, height: front + 8, front };
}

/** Where someone stands up beside their chair, on the pod's outer side, and walks off from. */
export function standAt(lay: CafeLayout, i: number): Point {
  const d = lay.desks[i];
  const p = lay.pods[d.pod];
  return { x: d.side ? p.x + POD_W - 2 : p.x + 2, y: d.face === "front" ? p.d - 2 : p.d + 40 };
}

/** The box a click on a seat lands in: its quarter of the pod, chair and person included. */
export function seatBox(lay: CafeLayout, i: number): { x: number; y: number; w: number; h: number } {
  const d = lay.desks[i];
  const p = lay.pods[d.pod];
  return d.face === "front" ? { x: d.x - 19, y: p.d - 18, w: 38, h: 28 } : { x: d.x - 19, y: p.d + 10, w: 38, h: 34 };
}

/** The counter on the left and the lounge on the right stand in the first row's way across the room. */
function blocked(lay: CafeLayout, x: number, row: number): boolean {
  if (x < 14 || x > lay.width - 14) return true;
  if (row === 0 && (x < LEFT + 4 || x > lay.width - RIGHT - 4)) return true;
  return lay.pods.some((p) => p.row === row && x >= p.x - 6 && x <= p.x + POD_W + 6);
}

/** An x where someone can cross from one aisle to another without walking through a pod, the counter or the sofa. */
export function crossingX(lay: CafeLayout, fromX: number, toX: number, ra: number, rb: number): number {
  const lo = Math.min(ra, rb);
  const hi = Math.max(ra, rb);
  let best = Math.round(lay.width / 2);
  let bestCost = Infinity;
  for (let x = 6; x <= lay.width - 6; x += 2) {
    let free = true;
    for (let r = lo; r < hi && free; r++) free = !blocked(lay, x, r);
    if (!free) continue;
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

/** Walking route from beside one agent's chair to beside another's, out along the aisles and between the pods. */
export function handoffPath(lay: CafeLayout, from: number, to: number): Point[] {
  return route(lay, standAt(lay, from), lay.desks[from].row, standAt(lay, to), lay.desks[to].row);
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
