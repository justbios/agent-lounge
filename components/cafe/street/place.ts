import { Standing } from "../placement";
import { StreetLayout } from "./geom";

/** A bought piece as the street shows it: on an outside sill, or behind the glass of window `win`. */
export interface StreetPiece {
  s: Standing;
  cx: number;
  bottom: number;
  /** -1 outside on a sill */
  win: number;
  /** behind the seats (against the back wall) or in front of them (hanging from the ceiling) */
  back: boolean;
}

const memo = new WeakMap<Standing[], Map<StreetLayout, StreetPiece[]>>();

/** Where each piece goes on the street. Spots are handed out in order, so the same pieces always land the same. */
export function streetPieces(lay: StreetLayout, list: Standing[]): StreetPiece[] {
  const byLay = memo.get(list) ?? new Map<StreetLayout, StreetPiece[]>();
  memo.set(list, byLay);
  const hit = byLay.get(lay);
  if (hit) return hit;
  const ground = lay.wins.map((w, i) => ({ w, i })).filter((q) => q.w.floor === 0);
  // sill spots out front, leaving the right-hand end of the last window free for the cat
  const sills: { x: number; y: number }[] = [];
  for (let k = 0; k < 8; k++)
    for (const { w } of ground) {
      const x = w.x + 6 + k * 15;
      if (x < w.x + w.w - (w === ground[ground.length - 1].w ? 26 : 6)) sills.push({ x, y: w.y + w.h + 1 });
    }
  const wallAt: { win: number; x: number }[] = [];
  for (const f of [0.3, 0.72, 0.5, 0.12, 0.9]) lay.wins.forEach((w, i) => wallAt.push({ win: i, x: Math.round(w.x + w.w * f) }));
  const floorAt: { win: number; x: number }[] = [
    ...lay.spare.map((s) => ({ win: s.win, x: s.px + 20 })),
    ...[0.08, 0.92, 0.5, 0.3, 0.7].flatMap((f) => lay.wins.map((w, i) => ({ win: i, x: Math.round(w.x + w.w * f) }))),
  ];
  const ceilAt: { win: number; x: number }[] = [];
  for (const f of [0.5, 0.2, 0.8]) lay.wins.forEach((w, i) => ceilAt.push({ win: i, x: Math.round(w.x + w.w * f) }));
  const n = { sill: 0, wall: 0, floor: 0, ceil: 0 };
  const out: StreetPiece[] = [];
  for (const s of list) {
    if (s.layer === "sill") {
      const p = sills[n.sill++ % Math.max(1, sills.length)];
      if (p) out.push({ s, cx: p.x + s.w / 2, bottom: p.y, win: -1, back: false });
    } else if (s.layer === "wall") {
      const p = wallAt[n.wall++ % wallAt.length];
      out.push({ s, cx: p.x, bottom: lay.wins[p.win].y + 26, win: p.win, back: true });
    } else if (s.layer === "ceiling") {
      const p = ceilAt[n.ceil++ % ceilAt.length];
      out.push({ s, cx: p.x, bottom: lay.wins[p.win].y + 4 + s.h, win: p.win, back: false });
    } else if (s.layer === "rug") {
      const p = floorAt[n.floor++ % floorAt.length];
      out.push({ s, cx: p.x, bottom: lay.wins[p.win].y + 51, win: p.win, back: true });
    } else if (s.layer === "floor") {
      const p = floorAt[n.floor++ % floorAt.length];
      out.push({ s, cx: p.x, bottom: lay.wins[p.win].y + 47, win: p.win, back: true });
    }
  }
  byLay.set(lay, out);
  return out;
}

/** The piece under a point, topmost first. */
export function pieceAt(list: StreetPiece[], p: { x: number; y: number }): StreetPiece | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const q = list[i];
    if (p.x >= q.cx - q.s.w / 2 - 1 && p.x < q.cx + q.s.w / 2 + 1 && p.y >= q.bottom - q.s.h - 1 && p.y < q.bottom + 1) return q;
  }
  return null;
}
