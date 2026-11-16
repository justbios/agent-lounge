import { CafeLayout } from "@/lib/cafe/layout";
import { Point } from "@/lib/layout";

/** One seat's width in a shop window: a chair, a person side-on and a desk with its monitor. */
export const SEAT_W = 37;
/** A shop window's glass, top to bottom. */
export const WIN_H = 51;
/** How much taller the facade gets for a lit upper floor. */
const UPPER = 70;
const DOOR_W = 33;

export interface StreetWin {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 the ground floor, 1 the floor above */
  floor: number;
  /** seats the window has room for */
  slots: number;
}

/** Where a seat is: `px` is its left edge, as in the design; the chair, the person and the desk hang off it. */
export interface StreetSeat {
  win: number;
  px: number;
  /** the window's top */
  y0: number;
}

export interface StreetLayout extends CafeLayout {
  street: true;
  /** the upper floor pushes everything at street level down by this much */
  U: number;
  floors: number;
  /** the café's own facade, left and right edges */
  fx0: number;
  fx1: number;
  wins: StreetWin[];
  /** one per agent, in pipeline order */
  seats: StreetSeat[];
  /** seats nobody sits at: an empty chair and a dark monitor */
  spare: StreetSeat[];
  door: { x: number; y: number; w: number; h: number };
  /** the glass of the door, where the barista and the guests at the counter are seen */
  glass: { x: number; y: number; w: number; h: number };
  sign: { x: number; y: number; w: number; h: number };
  /** the top of the pavement and of the kerb */
  walk: number;
  kerb: number;
  lampX: number;
  aframe: Point;
}

/** How many sit in each window, filled as evenly as the windows allow, in order. */
function share(n: number, wins: number): number[] {
  const out: number[] = [];
  let left = n;
  for (let w = 0; w < wins; w++) {
    const k = Math.ceil(left / (wins - w));
    out.push(k);
    left -= k;
  }
  return out;
}

const memo = new Map<number, StreetLayout>();

/**
 * The café seen from the street: one window for a single agent, two either side of the door for up to six, the upper
 * floor lit for up to twelve; past that the windows widen to take more seats each.
 */
export function streetLayout(n: number): StreetLayout {
  const hit = memo.get(n);
  if (hit) return hit;
  const floors = n > 6 ? 2 : 1;
  const one = n <= 1;
  const perWin = one ? 1 : n <= 12 ? 3 : Math.ceil(n / 4);
  const winW = one ? 45 : perWin * SEAT_W;
  const facade = one ? 10 + winW + 7 + DOOR_W + 10 : 2 * winW + 66;
  const W = Math.max(320, facade + 32);
  const U = floors === 2 ? UPPER : 0;
  const H = 180 + U;
  const fx0 = Math.round((W - facade) / 2);
  const fx1 = fx0 + facade;
  const y0 = 88 + U;
  const wins: StreetWin[] = [{ x: fx0 + 10, y: y0, w: winW, h: WIN_H, floor: 0, slots: perWin }];
  const doorX = fx0 + 10 + winW + 7;
  if (!one) wins.push({ x: doorX + DOOR_W + 6, y: y0, w: winW, h: WIN_H, floor: 0, slots: perWin });
  if (floors === 2) for (const w of wins.slice(0, 2)) wins.push({ ...w, y: y0 - 78, floor: 1 });
  // the ground floor fills first, then the floor above, each floor's windows as evenly as they go
  const ground = floors === 2 ? Math.min(n, 2 * perWin) : n;
  const counts = [...share(ground, one ? 1 : 2), ...(floors === 2 ? share(n - ground, 2) : [])];
  const seats: StreetSeat[] = [];
  const spare: StreetSeat[] = [];
  wins.forEach((w, wi) => {
    const k = counts[wi] ?? 0;
    const off = Math.floor((w.slots - k) / 2);
    const pad = one ? 4 : 0;
    for (let s = 0; s < w.slots; s++) {
      const seat = { win: wi, px: w.x + pad + s * SEAT_W, y0: w.y };
      if (s >= off && s < off + k) seats.push(seat);
      else spare.push(seat);
    }
  });
  const desks = seats.map((s) => ({ x: s.px + 20, top: s.y0 + 8, row: wins[s.win].floor, face: "front" as const, pod: 0, side: 0 as const }));
  const door = { x: doorX, y: 86 + U, w: DOOR_W, h: 64 };
  const lay: StreetLayout = {
    street: true,
    desks,
    pods: [],
    front: H,
    bands: floors === 2 ? [y0 - 78, y0] : [y0],
    walkY: floors === 2 ? [y0 - 78 + 49, y0 + 49] : [y0 + 49],
    width: W,
    height: H,
    U,
    floors,
    fx0,
    fx1,
    wins,
    seats,
    spare,
    door,
    glass: { x: door.x + 4, y: door.y + 4, w: 25, h: 30 },
    sign: { x: Math.round((fx0 + fx1) / 2 - 44), y: 57, w: 89, h: 17 },
    walk: 150 + U,
    kerb: 166 + U,
    lampX: W - 10,
    aframe: { x: door.x - 17, y: 147 + U },
  };
  memo.set(n, lay);
  return lay;
}

/** The point inside a window where someone walking past the desks has their feet. */
export const floorY = (s: { y0: number }) => s.y0 + 49;

/** The middle of a seat, where its tag hangs and its walker stands to hand over. */
export const seatMid = (s: StreetSeat) => s.px + 20;
