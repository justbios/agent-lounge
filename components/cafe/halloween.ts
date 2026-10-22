import { Dir } from "@/lib/cafe/layout";
import { COSTUMES, Costume } from "@/lib/live/interior";
import { Box, Ctx, LINE, Rect, glow, paint, px } from "./pixel";

export { COSTUMES, type Costume };

const ORANGE = "#e8761e";
const ORANGE_DARK = "#c95e12";
const ORANGE_HI = "#f59a3e";
const STEM = "#3e7a3a";
const CANDLE = "#ffd25a";
const HAT = "#2a1f36";
const SHEET = "#eef0f6";
const SHEET_SHADE = "#c9cede";
const SILK = "#c9cede";
const BAT = "#1a1420";
const CAPE = "#1c1222";
const CAPE_HI = "#2e2036";
const LINING = "#b0203c";
const HORN = "#d8283c";
const HORN_HI = "#ff6a6a";

type View = "front" | "back" | "side" | "seated";

const mirror =
  (L: number) =>
  (b: Box): Box => [2 * L + 10 - b[0] - b[2], b[1], b[2], b[3]];
const mirrorRect =
  (L: number) =>
  (r: Rect): Rect => [2 * L + 10 - r[0] - r[2], r[1], r[2], r[3], r[4]];

/** A witch's hat with an orange band, over a head 8 pixels square at (L + 1, T). */
function hat(L: number, T: number): [Box[], Rect[]] {
  return [
    [
      [L, T - 1, 10, 1],
      [L + 3, T - 3, 5, 2],
      [L + 4, T - 5, 3, 2],
      [L + 5, T - 6, 2, 1],
      [L + 6, T - 7, 2, 1],
    ],
    [
      [L, T - 1, 10, 1, HAT],
      [L + 3, T - 3, 5, 2, HAT],
      [L + 3, T - 2, 5, 1, "#ff8a2a"],
      [L + 4, T - 5, 3, 2, HAT],
      [L + 4, T - 5, 1, 2, "#3d2f4d"],
      [L + 5, T - 6, 2, 1, HAT],
      [L + 6, T - 7, 2, 1, HAT],
    ],
  ];
}

/** A carved pumpkin in place of the head, its face lit from inside when it looks this way. */
function pumpkin(L: number, T: number, view: View): [Box[], Rect[]] {
  const sil: Box[] = [
    [L, T, 10, 8],
    [L + 4, T - 2, 2, 2],
  ];
  const f: Rect[] = [
    [L, T, 10, 8, ORANGE],
    [L + 1, T, 8, 1, ORANGE_HI],
    [L + 3, T, 1, 8, ORANGE_DARK],
    [L + 6, T, 1, 8, ORANGE_DARK],
    [L + 4, T - 2, 2, 2, STEM],
  ];
  if (view === "front") {
    f.push(
      [L + 2, T + 2, 2, 2, CANDLE],
      [L + 6, T + 2, 2, 2, CANDLE],
      [L + 2, T + 5, 6, 1, CANDLE],
      [L + 4, T + 5, 1, 1, ORANGE],
    );
  } else if (view === "side") f.push([L + 7, T + 2, 2, 2, CANDLE], [L + 6, T + 5, 3, 1, CANDLE]);
  return [sil, f];
}

/** A sheet over the whole person, down to the shoes, with two holes to look through; seated, over the shoulders. */
function ghost(L: number, T: number, view: View, step: number): [Box[], Rect[]] {
  const low = view === "seated" ? T + 11 : T + 15;
  const sil: Box[] = [
    [L + 1, T - 1, 8, 2],
    [L, T + 1, 10, low - T],
  ];
  const f: Rect[] = [
    [L + 1, T - 1, 8, 2, SHEET],
    [L, T + 1, 10, low - T, SHEET],
    [L + 8, T + 2, 2, low - T - 1, SHEET_SHADE],
  ];
  if (view === "seated") {
    sil.push([L - 1, T + 6, 12, 6]);
    f.push([L - 1, T + 6, 12, 6, SHEET], [L + 9, T + 6, 2, 6, SHEET_SHADE]);
  } else {
    for (const x of step % 2 ? [L + 1, L + 5] : [L, L + 4, L + 8]) {
      sil.push([x, low + 1, 2, 1]);
      f.push([x, low + 1, 2, 1, SHEET]);
    }
  }
  if (view === "front") f.push([L + 3, T + 3, 1, 2, LINE], [L + 6, T + 3, 1, 2, LINE], [L + 4, T + 7, 2, 1, "#4a4458"]);
  else if (view === "side") f.push([L + 7, T + 3, 1, 2, LINE]);
  return [sil, f];
}

/** A black cape from the shoulders to the ankles with a tall red-lined collar; from the front, two fangs. */
function vampire(L: number, T: number, view: View): [Box[], Rect[]] {
  if (view === "seated") {
    return [
      [
        [L - 1, T + 4, 2, 10],
        [L + 9, T + 4, 2, 10],
        [L, T + 7, 10, 7],
      ],
      [
        [L - 1, T + 4, 2, 10, CAPE],
        [L, T + 5, 1, 3, LINING],
        [L + 9, T + 4, 2, 10, CAPE],
        [L + 9, T + 5, 1, 3, LINING],
        [L, T + 7, 10, 7, CAPE],
        [L + 3, T + 9, 1, 5, CAPE_HI],
        [L + 6, T + 9, 1, 5, CAPE_HI],
      ],
    ];
  }
  if (view === "side") {
    return [
      [[L + 1, T + 4, 2, 13]],
      [
        [L + 1, T + 4, 2, 13, CAPE],
        [L + 2, T + 5, 1, 2, LINING],
        [L + 1, T + 10, 1, 7, CAPE_HI],
      ],
    ];
  }
  const sil: Box[] = [
    [L - 1, T + 3, 2, 14],
    [L + 9, T + 3, 2, 14],
  ];
  const f: Rect[] = [
    [L - 1, T + 3, 1, 14, CAPE],
    [L + 10, T + 3, 1, 14, CAPE],
    [L, T + 3, 1, 14, view === "front" ? LINING : CAPE],
    [L + 9, T + 3, 1, 14, view === "front" ? LINING : CAPE],
  ];
  if (view === "back") {
    sil.push([L, T + 8, 10, 9]);
    f.push([L, T + 8, 10, 9, CAPE], [L + 3, T + 10, 1, 7, CAPE_HI], [L + 6, T + 10, 1, 7, CAPE_HI]);
  } else f.push([L + 3, T + 7, 1, 1, SHEET], [L + 6, T + 7, 1, 1, SHEET]);
  return [sil, f];
}

/** Two red horns curling out of the head and, but from the front, a tail with an arrow tip. */
function devil(L: number, T: number, view: View): [Box[], Rect[]] {
  const left: Rect[] = [
    [L + 2, T - 1, 2, 1, HORN],
    [L + 1, T - 2, 2, 1, HORN],
    [L + 1, T - 3, 1, 1, HORN_HI],
  ];
  const right: Rect[] = [
    [L + 6, T - 1, 2, 1, HORN],
    [L + 7, T - 2, 2, 1, HORN],
    [L + 8, T - 3, 1, 1, HORN_HI],
  ];
  const horns = view === "side" ? right : [...left, ...right];
  const tail: Rect[] =
    view === "back"
      ? [
          [L + 5, T + 13, 1, 2, HORN],
          [L + 6, T + 15, 2, 1, HORN],
          [L + 8, T + 13, 1, 2, HORN],
          [L + 8, T + 12, 2, 2, HORN_HI],
        ]
      : view === "side"
        ? [
            [L + 2, T + 12, 1, 1, HORN],
            [L + 1, T + 13, 1, 2, HORN],
            [L, T + 14, 1, 1, HORN],
            [L - 1, T + 12, 2, 2, HORN_HI],
          ]
        : [];
  const all = [...horns, ...tail];
  return [all.map(([x, y, w, h]) => [x, y, w, h] as Box), all];
}

function costume(c: Costume, L: number, T: number, view: View, step: number): [Box[], Rect[]] {
  switch (c) {
    case "hat":
      return hat(L, T);
    case "pumpkin":
      return pumpkin(L, T, view);
    case "ghost":
      return ghost(L, T, view, step);
    case "vampire":
      return vampire(L, T, view);
    default:
      return devil(L, T, view);
  }
}

/** A costume over someone {@link drawPerson} drew walking: feet at `feetY`, facing `dir`. */
export function drawCostume(ctx: Ctx, c: Costume, x: number, feetY: number, dir: Dir, step: number) {
  const L = Math.round(x) - 5;
  const T = Math.round(feetY) - 18;
  const view: View = dir === "up" ? "back" : dir === "down" ? "front" : "side";
  const [sil, f] = costume(c, L, T, view, step);
  if (dir === "left") paint(ctx, sil.map(mirror(L)), f.map(mirrorRect(L)));
  else paint(ctx, sil, f);
}

/** A costume over someone {@link drawSeated} drew from behind, its head's top at `T`. */
export function drawCostumeSeated(ctx: Ctx, c: Costume, X: number, T: number) {
  const [sil, f] = costume(c, X - 5, T, "seated", 0);
  paint(ctx, sil, f);
}

/** A costume over someone lounging on the couch, facing out, its head's top at `T`. */
export function drawCostumeLounging(ctx: Ctx, c: Costume, X: number, T: number) {
  const [sil, f] = costume(c, X - 5, T, "front", 0);
  paint(ctx, sil, f);
}

/** A jack-o'-lantern for the windowsill, its candle flickering behind the carved face. */
function pumpkinPiece(ctx: Ctx, L: number, B: number, t: number) {
  const lit = Math.floor(t * 6) % 4 === 0 ? "#ffb347" : CANDLE;
  paint(
    ctx,
    [
      [L + 1, B - 7, 7, 1],
      [L, B - 6, 9, 6],
      [L + 4, B - 9, 1, 2],
    ],
    [
      [L + 1, B - 7, 7, 1, ORANGE_HI],
      [L, B - 6, 9, 6, ORANGE],
      [L + 2, B - 7, 1, 7, ORANGE_DARK],
      [L + 6, B - 7, 1, 7, ORANGE_DARK],
      [L + 4, B - 9, 1, 2, STEM],
      [L + 5, B - 9, 1, 1, STEM],
      [L + 1, B - 5, 2, 1, lit],
      [L + 6, B - 5, 2, 1, lit],
      [L + 4, B - 4, 1, 1, lit],
      [L + 2, B - 2, 5, 1, lit],
      [L + 3, B - 2, 1, 1, ORANGE],
      [L + 5, B - 2, 1, 1, ORANGE],
    ],
  );
}

const WEB = [
  "X......X......X",
  ".X.....X.....X.",
  "..XXXXXXXXXXX..",
  "...X...X...X...",
  "....XXXXXXX....",
  ".....X.X.X.....",
  "......XXX......",
  ".......X.......",
];
const BAT_WINGS = ["X..X.X..X", "XX.XXX.XX", "XXXXXXXXX", ".X..X..X."];

/** Pixels marked X in `rows`, from (L, T). */
function sprite(ctx: Ctx, rows: readonly string[], L: number, T: number, c: string) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === "X" && px(ctx, L + x, T + y, 1, 1, c)));
}

/** A web hanging from the ceiling, its spider let down on a thread to wherever the piece was put. */
function cobweb(ctx: Ctx, L: number, B: number, t: number) {
  ctx.globalAlpha = 0.8;
  sprite(ctx, WEB, L, 0, SILK);
  const cx = L + 7;
  const y = B - 4 + Math.round(Math.sin(t * 1.4));
  px(ctx, cx, WEB.length, 1, y - WEB.length, SILK);
  ctx.globalAlpha = 1;
  const legs = [[-2, 0], [-3, 1], [-3, 2], [-2, 3], [2, 0], [3, 1], [3, 2], [2, 3]];
  for (const [dx, dy] of legs) px(ctx, cx + dx, y + dy, 1, 1, BAT);
  px(ctx, cx - 1, y, 3, 3, "#5e4f6e");
  px(ctx, cx - 1, y, 3, 1, "#7a6a8a");
  px(ctx, cx, y + 3, 1, 1, "#5e4f6e");
  px(ctx, cx - 1, y + 2, 1, 1, "#ff5d5d");
  px(ctx, cx + 1, y + 2, 1, 1, "#ff5d5d");
}

/** Paper bats with yellow eyes and orange flags on a string that sags between two threads from the ceiling. */
function batGarland(ctx: Ctx, L: number, B: number, t: number) {
  const top = B - 9;
  px(ctx, L, 0, 1, top, "#8a8f9c");
  px(ctx, L + 30, 0, 1, top, "#8a8f9c");
  const sag = (x: number) => top + Math.round(3 - ((x - 15) * (x - 15)) / 75);
  for (let x = 0; x <= 30; x++) px(ctx, L + x, sag(x), 1, 1, "#ff8a2a");
  [10, 20].forEach((x) => {
    px(ctx, L + x - 1, sag(x) + 1, 3, 1, "#ff8a2a");
    px(ctx, L + x, sag(x) + 2, 1, 1, "#ff8a2a");
  });
  [5, 15, 25].forEach((x, k) => {
    const y = sag(x) + 1 + (Math.floor(t * 1.2 + k) % 2);
    sprite(ctx, BAT_WINGS, L + x - 4, y, BAT);
    px(ctx, L + x - 1, y + 1, 1, 1, CANDLE);
    px(ctx, L + x + 1, y + 1, 1, 1, CANDLE);
  });
}

/** A black pot on three legs over a small fire, green brew bubbling over the rim. */
function cauldron(ctx: Ctx, L: number, B: number, t: number) {
  const flame = Math.floor(t * 8) % 2;
  px(ctx, L + 5, B - 3 - flame, 2, 2 + flame, "#ff7a2a");
  px(ctx, L + 9, B - 2 - (1 - flame), 2, 1 + (1 - flame), "#ff7a2a");
  px(ctx, L + 7, B - 2, 2, 1, CANDLE);
  paint(
    ctx,
    [
      [L + 2, B - 3, 1, 3],
      [L + 13, B - 3, 1, 3],
      [L + 1, B - 11, 14, 7],
      [L, B - 12, 16, 2],
    ],
    [
      [L + 2, B - 3, 1, 3, "#2a2a33"],
      [L + 13, B - 3, 1, 3, "#2a2a33"],
      [L + 1, B - 11, 14, 7, "#2a2a33"],
      [L + 3, B - 10, 1, 4, "#4a4a58"],
      [L, B - 12, 16, 2, "#3a3a46"],
      [L + 2, B - 12, 12, 1, "#6fe06f"],
    ],
  );
  for (let k = 0; k < 3; k++) {
    const p = (t * 0.7 + k / 3) % 1;
    ctx.globalAlpha = 1 - p;
    px(
      ctx,
      L + 4 + k * 4 + Math.round(Math.sin(t * 2 + k) * 0.6),
      B - 13 - Math.round(p * 7),
      p < 0.4 ? 2 : 1,
      1,
      "#9dff8a",
    );
  }
  ctx.globalAlpha = 1;
}

export const HALLOWEEN_DRAW = { pumpkin: pumpkinPiece, cobweb, bats: batGarland, cauldron };

/** The light a Halloween piece gives off; false for any other piece. */
export function halloweenLight(ctx: Ctx, id: string, cx: number, bottom: number, t: number): boolean {
  if (id === "pumpkin") glow(ctx, cx, bottom - 4, 10, "#ff9a3c", 0.18 + (Math.floor(t * 6) % 4 === 0 ? -0.04 : 0));
  else if (id === "cauldron") glow(ctx, cx, bottom - 12, 12, "#7aff6a", 0.14);
  else return false;
  return true;
}
