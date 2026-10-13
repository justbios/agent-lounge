import { CafeLayout, WALL_H } from "@/lib/cafe/layout";
import { Point } from "@/lib/layout";
import { ItemDef, ItemId, Placed, itemOf } from "@/lib/live/interior";
import { doorOf, fixtures } from "./room";

const SILL_Y = 33;
const FLOOR_DECOR_Y = 132;
/** the owl that the night-owl achievement puts on the first window's sill */
const OWL = { x: 111, y: 22, w: 9, h: 12 };

/** Where a piece of furniture stands, in scene pixels: the middle of its foot. */
export interface Spot {
  cx: number;
  bottom: number;
}

export interface Standing extends Spot {
  pid: string;
  item: ItemId;
  w: number;
  floor: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const boxOf = (it: ItemDef, s: Spot): Box => ({ x: s.cx - it.w / 2, y: s.bottom - it.h, w: it.w, h: it.h });

const memo = new WeakMap<CafeLayout, Box[]>();

/** Desks with their chairs and people, the bar, the vending machine, the door and the earned floor decor. */
function obstacles(lay: CafeLayout): Box[] {
  const hit = memo.get(lay);
  if (hit) return hit;
  const v = fixtures(lay.width).VENDING;
  const d = doorOf(lay);
  const out: Box[] = [
    ...lay.desks.map((k) => ({ x: k.x - 27, y: k.top - 8, w: 54, h: 56 })),
    { x: 0, y: 40, w: 49, h: 60 },
    { x: v.x - 12, y: v.y, w: lay.width - v.x + 12, h: v.h + 4 },
    { x: d.x - 4, y: d.y - 14, w: d.w + 8, h: lay.height - d.y + 14 },
    { x: 0, y: FLOOR_DECOR_Y - 32, w: 42, h: 34 },
    { x: lay.width - 24, y: FLOOR_DECOR_Y - 26, w: 24, h: 28 },
    { x: 0, y: lay.height - 34, w: 24, h: 34 },
  ];
  memo.set(lay, out);
  return out;
}

function fits(lay: CafeLayout, it: ItemDef, s: Spot, others: Standing[]): boolean {
  const b = boxOf(it, s);
  if (it.place === "sill" && overlap(OWL, b)) return false;
  if (it.place === "floor") {
    if (s.bottom < WALL_H + 4 || s.bottom > lay.height - 4 || b.x < 1 || b.x + b.w > lay.width - 1) return false;
    if (obstacles(lay).some((o) => overlap(o, b))) return false;
  }
  return !others.some((o) => o.floor === (it.place === "floor") && overlap(boxOf(itemOf(o.item)!, o), b));
}

/** Where an item would stand for a pointer at `p`, or null when there is no room for it there. */
export function spotAt(lay: CafeLayout, it: ItemDef, p: Point, others: Standing[]): Spot | null {
  if (it.place === "sill") {
    const w = fixtures(lay.width).WINDOWS.find((w) => p.x >= w.x - 4 && p.x <= w.x + w.w + 4 && p.y < WALL_H);
    if (!w) return null;
    const half = Math.ceil(it.w / 2) + 1;
    const s = { cx: Math.max(w.x + half, Math.min(w.x + w.w - half, Math.round(p.x))), bottom: SILL_Y };
    return fits(lay, it, s, others) ? s : null;
  }
  const s = { cx: Math.round(p.x), bottom: Math.round(p.y + it.h / 2) };
  return fits(lay, it, s, others) ? s : null;
}

/** The nearest free spot to the stored one: desks move from chat to chat, so furniture steps aside. */
function settle(lay: CafeLayout, it: ItemDef, want: Spot, others: Standing[]): Spot | null {
  if (fits(lay, it, want, others)) return want;
  if (it.place === "sill") return null;
  for (let r = 4; r <= 96; r += 4) {
    for (let a = 0; a < 16; a++) {
      const s = { cx: Math.round(want.cx + Math.cos((a / 16) * 2 * Math.PI) * r), bottom: Math.round(want.bottom + Math.sin((a / 16) * 2 * Math.PI) * r) };
      if (fits(lay, it, s, others)) return s;
    }
  }
  return null;
}

/** Every piece of furniture in this layout, in the order they were placed. */
export function standing(lay: CafeLayout, placed: Placed[]): Standing[] {
  const out: Standing[] = [];
  for (const p of placed) {
    const it = itemOf(p.item);
    if (!it) continue;
    const want = { cx: Math.round((p.x / 1000) * lay.width), bottom: Math.min(p.y, lay.height - 4) };
    const s = settle(lay, it, want, out);
    if (s) out.push({ ...s, pid: p.pid, item: p.item, w: it.w, floor: it.place === "floor" });
  }
  return out;
}

export const toPlaced = (lay: CafeLayout, pid: string, item: ItemId, s: Spot): Placed => ({
  pid,
  item,
  x: Math.max(0, Math.min(1000, Math.round((s.cx / lay.width) * 1000))),
  y: s.bottom,
});

/** The furniture under a point, topmost first, for picking a piece up again. */
export function standingAt(list: Standing[], p: Point): Standing | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    const it = itemOf(s.item)!;
    if (overlap(boxOf(it, s), { x: p.x, y: p.y, w: 1, h: 1 })) return s;
  }
  return null;
}
