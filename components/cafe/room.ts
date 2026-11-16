import { CafeLayout } from "@/lib/cafe/layout";
import { Point } from "@/lib/layout";
import { Ctx, LINE, px } from "./pixel";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Fixtures {
  /** the glass wall onto the city, floor to ceiling, its ledge at {@link SILL_Y} */
  WINDOWS: { x: number; w: number }[];
  /** the neon letters on the glass, with the line under them */
  SIGN: Rect;
  /** the LED panel under the shelves that shows tokens a minute */
  METER: Rect;
  CLOCK: { x: number; y: number };
  /** the menu screen over the coffee bar: the day's recap */
  BOARD: Rect;
  /** the shelves on the right of the back wall */
  SHELVES: Rect;
  /** the back counter with the coffee machine: the café's shop */
  VENDING: Rect;
  /** the barista's front counter, its stools and the bistro table: the group chat */
  BAR: Rect;
  /** the arcade cabinet in the games corner */
  ARCADE: Rect;
  /** the lounge: sofa, floor lamp, table and bean bags */
  LOUNGE: Rect;
  SOFA: Rect;
  /** the bistro table near the door, middle of its top */
  BISTRO: Point;
}

/** The top of the ledge along the glass wall, where pieces from the shop stand. */
export const SILL_Y = 58;
/** The floor line under the back wall's skirting. */
export const FLOOR_TOP = 66;

const memo = new Map<string, Fixtures>();

/** Everything fixed in a hall of this layout's width and depth: the wall stays the design's, spread over a wider room. */
export function fixtures(width: number, front = 184): Fixtures {
  const key = `${width}|${front}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const lx = width - 72;
  /** the glass runs from the coffee bar's wall to the shelves */
  const wx = 94;
  const ww = width - wx - 68;
  const sw = 100;
  const fx: Fixtures = {
    WINDOWS: [{ x: wx, w: ww }],
    SIGN: { x: wx + Math.round((ww - sw) / 2), y: 7, w: sw, h: 14 },
    METER: { x: width - 62, y: 46, w: 38, h: 9 },
    CLOCK: { x: 76, y: 15 },
    BOARD: { x: 13, y: 6, w: 46, h: 25 },
    SHELVES: { x: width - 63, y: 6, w: 50, h: 35 },
    VENDING: { x: 10, y: 40, w: 64, h: 28 },
    BAR: { x: 8, y: 70, w: 74, h: 42 },
    ARCADE: { x: lx + 7, y: 152, w: 18, h: 30 },
    LOUNGE: { x: lx - 2, y: 66, w: 74, h: 82 },
    SOFA: { x: lx + 8, y: 85, w: 52, h: 24 },
    BISTRO: { x: width - 108, y: front - 22 },
  };
  memo.set(key, fx);
  return fx;
}

export const fixturesOf = (lay: CafeLayout) => fixtures(lay.width, lay.front);

/** The way in: a gap in the front wall in the middle, with a mat in front of it. */
export function doorOf(lay: CafeLayout) {
  const w = 38;
  return { x: Math.round(lay.width / 2) - 19, y: lay.front - 7, w, h: lay.height - lay.front + 7 };
}

/** Where everyone with the café open sits, `y` the seat's top: four stools at the counter, two at the bistro table. */
export function barSeats(width = 320, front = 184): Point[] {
  const b = fixtures(width, front).BISTRO;
  return [
    ...[16, 32, 48, 64].map((x) => ({ x, y: 100 })),
    { x: b.x - 13, y: b.y },
    { x: b.x + 13, y: b.y },
  ];
}
/** The seats of the first room size; {@link barSeats} has them for any width. */
export const BAR_SEATS: Point[] = barSeats();
/** The counter and its stools: a click anywhere here opens the café's chat. */
export const BAR_AREA = { x: 8, y: 70, w: 74, h: 42 };

export function drawPlant(ctx: Ctx, x: number, baseY: number) {
  const leaves = [[0, -22, 3, 6], [-5, -19, 4, 5], [4, -19, 4, 5], [-7, -14, 4, 4], [5, -14, 4, 4], [-2, -17, 4, 7], [-4, -11, 3, 3], [3, -11, 3, 3]];
  for (const [dx, dy, w, h] of leaves) px(ctx, x + dx - 1, baseY + dy - 1, w + 2, h + 2, LINE);
  leaves.forEach(([dx, dy, w, h], i) => px(ctx, x + dx, baseY + dy, w, h, i % 2 ? "#2f7a4b" : "#3e9a5d"));
  px(ctx, x - 6, baseY - 9, 12, 10, LINE);
  px(ctx, x - 5, baseY - 8, 10, 8, "#8a4b2f");
  px(ctx, x - 5, baseY - 8, 10, 2, "#a65d3b");
}
