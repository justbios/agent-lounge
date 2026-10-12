import { Point } from "@/lib/layout";

export const CAFE_W = 384;
export const WALL_H = 50;
export const SEAT_DY = 44;
export const STAND_MS = 320;
export const GIVE_MS = 520;
export const SIT_MS = 280;
export const WALK_PX_PER_MS = 0.03;

const FIRST_ROW = 66;
const ROW_STEP = 80;
const COL_STEP = 72;
const SIDE_STEP = 15;
const AREA_CENTER = 200;

export type Dir = "up" | "down" | "left" | "right";

export interface Desk {
  x: number;
  top: number;
  row: number;
  col: number;
}

export interface CafeLayout {
  desks: Desk[];
  lanes: number[];
  width: number;
  height: number;
}

/**
 * Desks in rows of up to four, snake-ordered like the diagram so consecutive
 * agents sit next to each other. Lanes are the walkable gaps between columns.
 */
export function cafeLayout(n: number): CafeLayout {
  const cols = Math.max(1, Math.min(4, n));
  const rows = Math.max(1, Math.ceil(n / cols));
  const colX = Array.from({ length: cols }, (_, c) => Math.round(AREA_CENTER + (c - (cols - 1) / 2) * COL_STEP));
  const desks: Desk[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const raw = i % cols;
    const col = row % 2 === 1 ? cols - 1 - raw : raw;
    desks.push({ x: colX[col], top: FIRST_ROW + row * ROW_STEP, row, col });
  }
  const lanes = [
    colX[0] - COL_STEP / 2,
    ...colX.slice(1).map((x, i) => (x + colX[i]) / 2),
    colX[cols - 1] + COL_STEP / 2,
  ];
  return { desks, lanes, width: CAFE_W, height: FIRST_ROW + (rows - 1) * ROW_STEP + 62 };
}

/** Walking route from beside one agent's chair to beside the next one's. */
export function handoffPath(lay: CafeLayout, from: number, to: number): Point[] {
  const a = lay.desks[from];
  const b = lay.desks[to];
  const out = b.x >= a.x ? 1 : -1;
  const start = { x: a.x + out * SIDE_STEP, y: a.top + SEAT_DY };
  const endY = b.top + SEAT_DY;
  if (a.row === b.row) {
    return [start, { x: b.x + (start.x < b.x ? -1 : 1) * SIDE_STEP, y: endY }];
  }
  const cost = (l: number) => Math.abs(start.x - l) + Math.abs(l - b.x);
  const lane = lay.lanes.reduce((best, l) => (cost(l) < cost(best) ? l : best));
  const end = { x: b.x + (lane < b.x ? -1 : 1) * SIDE_STEP, y: endY };
  return [start, { x: lane, y: start.y }, { x: lane, y: endY }, end];
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
