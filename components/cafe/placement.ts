import { CafeLayout, WALL_H } from "@/lib/cafe/layout";
import { Point } from "@/lib/layout";
import type { Decor } from "@/lib/live/achievements";
import { DECOR_PIECES, ItemDef, ItemId, ItemPlace, Placed, decorPid, itemOf } from "@/lib/live/interior";
import { FLOOR_Y } from "./decor";
import { doorOf, fixtures } from "./room";

const SILL_Y = 33;
const WALL_LOW = 36;
const WALL_TOP = 6;

export type Layer = Exclude<ItemPlace, "perk">;

/** Where a piece stands, in scene pixels: the middle of its foot. */
export interface Spot {
  cx: number;
  bottom: number;
}

export interface Standing extends Spot {
  pid: string;
  item: ItemId;
  w: number;
  h: number;
  layer: Layer;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const boxOf = (it: { w: number; h: number }, s: Spot): Box => ({ x: s.cx - it.w / 2, y: s.bottom - it.h, w: it.w, h: it.h });
const layerOf = (it: ItemDef): Layer => (it.place === "perk" ? "floor" : it.place);
/** up on the wall: a poster hangs on it between the fixtures, a piece from the ceiling hangs in front of them */
const high = (layer: Layer) => layer === "wall" || layer === "ceiling";

const floorMemo = new WeakMap<CafeLayout, Box[]>();
const wallMemo = new Map<number, Box[]>();

/** Desks with chairs and people, the bar and its high table, the drinks machine, the door, a tall room's plant. */
function floorBlocks(lay: CafeLayout): Box[] {
  const hit = floorMemo.get(lay);
  if (hit) return hit;
  const v = fixtures(lay.width).VENDING;
  const d = doorOf(lay);
  const out: Box[] = [
    ...lay.desks.map((k) => ({ x: k.x - 27, y: k.top - 8, w: 54, h: 56 })),
    { x: 0, y: 40, w: 49, h: 86 },
    { x: v.x - 12, y: v.y, w: lay.width - v.x + 12, h: v.h + 4 },
    { x: d.x - 4, y: d.y - 14, w: d.w + 8, h: lay.height - d.y + 14 },
  ];
  if (lay.height >= 180) out.push({ x: 0, y: lay.height - 34, w: 24, h: 34 });
  floorMemo.set(lay, out);
  return out;
}

/** The chalkboard, windows, sign, sconces and clock: a poster hangs only between them. */
function wallBlocks(width: number): Box[] {
  const hit = wallMemo.get(width);
  if (hit) return hit;
  const fx = fixtures(width);
  const out: Box[] = [
    { x: 1, y: 4, w: 47, h: 32 },
    ...fx.WINDOWS.map((w) => ({ x: w.x - 2, y: 3, w: w.w + 4, h: 34 })),
    { x: fx.SIGN.x - 1, y: fx.SIGN.y - 1, w: fx.SIGN.w + 2, h: fx.SIGN.h + 2 },
    ...fx.SCONCES.map((x) => ({ x: x - 5, y: 9, w: 10, h: 12 })),
    { x: fx.CLOCK.x - 9, y: fx.CLOCK.y - 9, w: 18, h: 18 },
  ];
  wallMemo.set(width, out);
  return out;
}

function fits(lay: CafeLayout, it: ItemDef, s: Spot, others: Standing[]): boolean {
  const b = boxOf(it, s);
  const layer = layerOf(it);
  if (b.x < 1 || b.x + b.w > lay.width - 1) return false;
  if (layer === "floor" || layer === "rug") {
    if (s.bottom < WALL_H + 4 || s.bottom > lay.height - 4) return false;
    if (floorBlocks(lay).some((o) => overlap(o, b))) return false;
  }
  if (high(layer)) {
    if (b.y < WALL_TOP || s.bottom > WALL_LOW) return false;
    if (layer === "wall" && wallBlocks(lay.width).some((o) => overlap(o, b))) return false;
  }
  return !others.some((o) => o.layer === layer && overlap(boxOf(o, o), b));
}

function sillSpots(lay: CafeLayout, it: ItemDef): Spot[] {
  const half = Math.ceil(it.w / 2) + 1;
  return fixtures(lay.width).WINDOWS.flatMap((w) => {
    const out: Spot[] = [];
    for (let cx = w.x + half; cx <= w.x + w.w - half; cx += 2) out.push({ cx, bottom: SILL_Y });
    return out;
  });
}

/** Where a piece would stand for a pointer at `p`, or null when there is no room for it there. */
export function spotAt(lay: CafeLayout, it: ItemDef, p: Point, others: Standing[]): Spot | null {
  const layer = layerOf(it);
  let s: Spot;
  if (layer === "sill") {
    const w = fixtures(lay.width).WINDOWS.find((w) => p.x >= w.x - 4 && p.x <= w.x + w.w + 4 && p.y < WALL_H);
    if (!w) return null;
    const half = Math.ceil(it.w / 2) + 1;
    s = { cx: Math.max(w.x + half, Math.min(w.x + w.w - half, Math.round(p.x))), bottom: SILL_Y };
  } else if (high(layer)) {
    const bottom = Math.max(WALL_TOP + it.h, Math.min(WALL_LOW, Math.round(p.y + it.h / 2)));
    s = { cx: Math.round(p.x), bottom };
  } else s = { cx: Math.round(p.x / 2) * 2, bottom: Math.round((p.y + it.h / 2) / 2) * 2 };
  return fits(lay, it, s, others) ? s : null;
}

/** The nearest free spot to the stored one: desks move from chat to chat and rooms widen, so pieces step aside. */
function settle(lay: CafeLayout, it: ItemDef, want: Spot, others: Standing[]): Spot | null {
  if (fits(lay, it, want, others)) return want;
  const layer = layerOf(it);
  if (layer === "sill") {
    const near = sillSpots(lay, it).sort((a, b) => Math.abs(a.cx - want.cx) - Math.abs(b.cx - want.cx));
    return near.find((s) => fits(lay, it, s, others)) ?? null;
  }
  if (high(layer)) {
    for (let d = 2; d <= lay.width; d += 2) {
      for (const cx of [want.cx - d, want.cx + d]) if (fits(lay, it, { cx, bottom: want.bottom }, others)) return { cx, bottom: want.bottom };
    }
    return null;
  }
  for (let r = 4; r <= 96; r += 4) {
    for (let a = 0; a < 16; a++) {
      const s = {
        cx: Math.round(want.cx + Math.cos((a / 16) * 2 * Math.PI) * r),
        bottom: Math.round(want.bottom + Math.sin((a / 16) * 2 * Math.PI) * r),
      };
      if (fits(lay, it, s, others)) return s;
    }
  }
  return null;
}

/** Where earned decor stood before it could be moved. */
function homeOf(lay: CafeLayout, id: ItemId): Spot {
  if (id === "arcade") return { cx: 11, bottom: FLOOR_Y };
  if (id === "aquarium") return { cx: 31, bottom: FLOOR_Y };
  if (id === "owl") return { cx: 115, bottom: SILL_Y };
  return { cx: lay.width - 14, bottom: Math.min(lay.height - 4, FLOOR_Y) };
}

/** Every piece in this layout: the earned decor first, then what was bought, in the order it was put down. */
export function standing(lay: CafeLayout, placed: Placed[], decor: ReadonlySet<Decor>): Standing[] {
  const want = new Map<string, { it: ItemDef; s: Spot }>();
  for (const d of DECOR_PIECES) {
    if (!decor.has(d.decor)) continue;
    const it = itemOf(d.id)!;
    const p = placed.find((q) => q.pid === decorPid(d.id));
    want.set(decorPid(d.id), { it, s: p ? toSpot(lay, p) : homeOf(lay, d.id) });
  }
  for (const p of placed) {
    const it = itemOf(p.item);
    if (it && !it.decor) want.set(p.pid, { it, s: toSpot(lay, p) });
  }
  const out: Standing[] = [];
  for (const [pid, { it, s }] of want) {
    const at = settle(lay, it, s, out);
    if (at) out.push({ ...at, pid, item: it.id, w: it.w, h: it.h, layer: layerOf(it) });
  }
  return out;
}

const toSpot = (lay: CafeLayout, p: Placed): Spot => ({ cx: Math.round((p.x / 1000) * lay.width), bottom: Math.min(p.y, lay.height - 4) });

export const toPlaced = (lay: CafeLayout, pid: string, item: ItemId, s: Spot): Placed => ({
  pid,
  item,
  x: Math.max(0, Math.min(1000, Math.round((s.cx / lay.width) * 1000))),
  y: s.bottom,
});

const PICK_ORDER: Layer[] = ["floor", "ceiling", "sill", "wall", "rug"];

/** The piece under a point, topmost first, for picking it up again. */
export function standingAt(list: Standing[], p: Point): Standing | null {
  const dot = { x: p.x, y: p.y, w: 1, h: 1 };
  for (const layer of PICK_ORDER) {
    const hit = list.filter((s) => s.layer === layer && overlap(boxOf(s, s), dot)).sort((a, b) => b.bottom - a.bottom)[0];
    if (hit) return hit;
  }
  return null;
}
