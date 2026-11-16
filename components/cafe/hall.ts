import { CafeLayout, POD_W, Pod, WALL_H } from "@/lib/cafe/layout";
import { AgentDef } from "@/lib/types";
import { propIndex } from "./desk";
import { hallPal, HallPal } from "./hallPal";
import { O, Pen, dk, hallPen, lt } from "./hallPen";
import { Ctx } from "./pixel";
import { Fixtures, SILL_Y, barSeats, doorOf, fixturesOf } from "./room";
import { mix } from "./street/px";
import { THEMES, Theme, keepsSky } from "./theme";
import { drawSkyline } from "./windows";

/** The hall painted once per layout and theme, in the layers the frame puts the moving parts between. */
export interface HallArt {
  /** floor, walls, the glass wall, the back counter, the lounge and the far row's chairs */
  base: HTMLCanvasElement;
  /** what stands in front of the far row and the barista: desks, monitors, lamps, the front counter and stools */
  mid: HTMLCanvasElement;
  /** how the room darkens towards its corners and the front, multiplied over everything */
  dim: HTMLCanvasElement;
  /** the warm lamps, added on top; off when the café is closed */
  lamps: HTMLCanvasElement;
  /** the neon and the arcade, which glow even in a closed café */
  neon: HTMLCanvasElement;
  /** the pendant lamps over the counter, painted after the light */
  post: HTMLCanvasElement;
  /** whether the sign is the brand's own, painted in pixels rather than written over */
  brand: boolean;
}

/** the top and bottom of the glass: it runs from the ceiling's LED strip down to the ledge */
const GY = 4;
const GB = SILL_Y;
/** the street level behind the glass, where the city stands */
const GROUND = GB - 3;

/** Clips to the glass of the window at `wx`, for what is seen through it. */
export function glassClip(g: Ctx, wx: number, ww: number) {
  g.beginPath();
  g.rect(wx + 2, GY + 1, ww - 4, GB - GY - 1);
  g.clip();
}
/** How far the glass wall's street sits below the old flat windows' ground, which weather and skylines are drawn for. */
export const VIEW_DY = GROUND - 32;
/** the rows of glass the weather has to cover, in the old windows' bands of 23 */
export const GLASS_ROWS = { top: GY + 1, bottom: GB };

/** The vertical bars of the glass wall: one every forty pixels or so. */
export function mullions(wx: number, ww: number): number[] {
  const n = Math.max(2, Math.round(ww / 40));
  return Array.from({ length: n - 1 }, (_, k) => Math.round(wx + (ww * (k + 1)) / n) - 1);
}

/** Sky colours spread over the glass from the theme's five. */
function skyRows(th: Theme, n: number): string[] {
  const s = th.sky;
  return Array.from({ length: n }, (_, i) => {
    const f = (i / (n - 1)) * (s.length - 1);
    const b = Math.min(s.length - 2, Math.floor(f));
    return mix(s[b], s[b + 1], f - b);
  });
}

const CITY = {
  night: { haze: "#2a2f5c", far: "#1c2148", near: "#121430", edge: "#262a52", street: "#0c0b1c", lit: ["#ffc870", "#7fd4ff"], share: 0.4, lamps: true },
  dusk: { haze: "#8a4a72", far: "#5a2e5c", near: "#2a1a3a", edge: "#3e2852", street: "#1a1024", lit: ["#ffc870", "#ff9a6a"], share: 0.36, lamps: true },
  dawn: { haze: "#8a6a8e", far: "#5e4a74", near: "#2c2a4a", edge: "#3e3a62", street: "#1c1a30", lit: ["#ffd27a", "#ffb27a"], share: 0.18, lamps: true },
  day: { haze: "#b4cce6", far: "#93abcf", near: "#5a7099", edge: "#7088b2", street: "#3a4660", lit: ["#c4d6ea", "#a8bed8"], share: 0.5, lamps: false },
} as const;

/** The city across the whole glass: a hazy far skyline with a TV tower, a near one with lit windows, the street below. */
function cityView(pen: Pen, x0: number, x1: number, th: Theme) {
  const { P, X, rnd, reseed } = pen;
  const c = CITY[th.light ?? "night"];
  reseed(77);
  // the far skyline, pale with distance
  for (let x = x0; x < x1; ) {
    const w = 5 + Math.floor(rnd() * 8);
    const h = 16 + Math.floor(rnd() * 16);
    P(x, GROUND - h, w, h, c.haze);
    if (rnd() < 0.3) P(x + (w >> 1), GROUND - h - 4, 1, 4, c.haze);
    x += w;
  }
  const tower = x0 + Math.round((x1 - x0) * 0.72);
  P(tower, GROUND - 46, 1, 46, c.far);
  P(tower - 1, GROUND - 30, 3, 30, c.far);
  P(tower - 3, GROUND - 36, 7, 3, c.far);
  P(tower - 2, GROUND - 38, 5, 2, c.far);
  X(tower, GROUND - 47, "#ff5a6a");
  // the middle skyline
  reseed(131);
  for (let x = x0 - 3; x < x1; ) {
    const w = 6 + Math.floor(rnd() * 9);
    const h = 12 + Math.floor(rnd() * 18);
    const top = GROUND - h;
    P(x, top, w, h, c.far);
    if (th.snowCaps) P(x, top, w, 1, "#e6ecff");
    for (let yy = top + 2; yy < GROUND - 1; yy += 3)
      for (let xx = x + 1; xx < x + w - 1; xx += 2) if (rnd() < c.share * 0.45) X(xx, yy, c.lit[1]);
    x += w + (rnd() < 0.3 ? 2 : 0);
  }
  // the near skyline
  reseed(211);
  for (let x = x0 - 2; x < x1; ) {
    const w = 8 + Math.floor(rnd() * 10);
    const h = 7 + Math.floor(rnd() * 14);
    const top = GROUND - h;
    P(x, top, w, h, c.near);
    P(x, top, 1, h, c.edge);
    P(x, top, w, 1, c.edge);
    if (th.snowCaps) P(x, top - 1, w, 1, "#e6ecff");
    for (let yy = top + 2; yy < GROUND - 1; yy += 2)
      for (let xx = x + 2; xx < x + w - 1; xx += 2) if (rnd() < c.share) X(xx, yy, rnd() < 0.7 ? c.lit[0] : c.lit[1]);
    const roof = rnd();
    if (roof < 0.25) {
      P(x + 2, top - 3, 4, 3, c.near);
      P(x + 3, top - 4, 2, 1, c.near);
    } else if (roof < 0.45) {
      P(x + w - 3, top - 5, 1, 5, c.near);
      X(x + w - 3, top - 6, "#ff5a6a");
    }
    x += w;
  }
  // the street: a dark band, its lamps and a few cars' lights
  P(x0, GROUND, x1 - x0, GB - GROUND, c.street);
  reseed(301);
  for (let x = x0 + 5; x < x1; x += 13 + Math.floor(rnd() * 6)) {
    P(x, GROUND - 4, 1, 4, c.near);
    X(x + 1, GROUND - 4, c.lamps ? "#ffd890" : "#8a96b0");
  }
  if (c.lamps)
    for (let x = x0 + 3; x < x1 - 2; x += 9 + Math.floor(rnd() * 14)) {
      X(x, GROUND + 1, rnd() < 0.5 ? "#ff5a5a" : "#fff2c8");
      X(x + 2, GROUND + 1, rnd() < 0.5 ? "#ff5a5a" : "#fff2c8");
    }
}

/** The glass wall: metal frame and bars, the sky at this hour, the city or the theme's outside, and the ledge. */
function drawWindow(g: Ctx, pen: Pen, fx: Fixtures, th: Theme, pal: HallPal) {
  const { P, A, X, ell, rnd, reseed } = pen;
  const { x: wx, w: ww } = fx.WINDOWS[0];
  const x0 = wx + 2;
  const x1 = wx + ww - 2;
  const light = th.light ?? "night";
  const rows = GB - GY - 1;
  const sky = skyRows(th, rows);
  for (let i = 0; i < rows; i++) P(x0, GY + 1 + i, x1 - x0, 1, sky[i]);
  g.save();
  glassClip(g, wx, ww);
  const spooky = th.skyline === "spooky";
  const planet = th.skyline === "planet";
  if (light === "night" || light === "dusk" || keepsSky(th)) {
    reseed(17);
    for (let k = 0; k < Math.round(ww / 5); k++) X(x0 + Math.floor(rnd() * (x1 - x0)), GY + 2 + Math.floor(rnd() * 26), th.stars);
  }
  const W3 = x0 + Math.round((x1 - x0) * 0.16);
  if (spooky) {
    ell(W3, GY + 14, 6, 6, "#e8913a");
    ell(W3 - 1, GY + 13, 5, 5, "#ffb347");
  } else if (!planet) {
    if (light === "night") {
      ell(W3, GY + 13, 5, 5, "#f4ecc8");
      ell(W3 + 2, GY + 12, 4, 4, sky[6]);
    } else if (light === "day") {
      ell(x1 - 18, GY + 12, 6, 6, "#ffe27a");
      ell(x1 - 18, GY + 12, 4, 4, "#fff6c8");
    } else {
      const sx = light === "dusk" ? x1 - 22 : W3 + 6;
      ell(sx, GROUND - 14, 8, 8, "#ffb46a");
      ell(sx, GROUND - 14, 6, 6, "#ffdca0");
    }
  }
  if (th.skyline === "city") cityView(pen, x0, x1, th);
  else {
    g.translate(0, VIEW_DY);
    drawSkyline(g, x0, x1 - x0, 0, th);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!planet) P(x0, GROUND + 1, x1 - x0, GB - GROUND - 1, mix(th.sky[0], "#000000", 0.45));
  }
  // light catching the glass
  for (const b of mullions(wx, ww).concat([wx])) {
    for (let i = 0; i < 14; i++) {
      A(b + 6 + i, GY + 30 - i * 2, 1, 2, "#ffffff", 0.09);
      A(b + 10 + i, GY + 30 - i * 2, 1, 2, "#ffffff", 0.05);
    }
  }
  g.restore();
  // the frame and its bars
  P(wx, GY, ww, 1, pal.frame);
  P(wx, GY, 2, GB - GY, pal.frame);
  P(wx + ww - 2, GY, 2, GB - GY, pal.frame);
  X(wx + 1, GY + 1, pal.frameHi);
  P(wx + 1, GY + 1, 1, GB - GY - 1, pal.frameHi);
  for (const m of mullions(wx, ww)) {
    P(m, GY, 2, GB - GY, pal.frame);
    P(m, GY + 1, 1, GB - GY - 1, pal.frameHi);
  }
  // the ledge: a long wooden bench along the glass
  P(wx - 2, GB - 1, ww + 4, 1, O);
  P(wx - 2, GB, ww + 4, 2, pal.sill);
  P(wx - 2, GB, ww + 4, 1, pal.sillHi);
  P(wx - 2, GB + 2, ww + 4, 1, dk(pal.sill, 0.4));
  P(wx - 2, GB + 3, ww + 4, 1, O);
}

/** The light from the glass falling on the floor, warm at sunset, white by day, faint and blue by night. */
function windowLight(th: Theme): [string, number] {
  if (keepsSky(th)) return [th.windowGlow, 0.1];
  const light = th.light ?? "night";
  if (light === "day") return ["#fff1cc", 0.2];
  if (light === "dawn") return ["#ffb27a", 0.15];
  if (light === "dusk") return ["#ff9850", 0.17];
  return ["#6f8cff", 0.08];
}

const CUP2 = ["#####..", "#...###", "#...#.#", "#...###", ".###..."];

/** The café's name in neon tubes on the glass, two pixels to a font pixel so it reads on a phone too. */
function drawSign(pen: Pen, fx: Fixtures, brand: boolean) {
  const { P, A, neonText, textW } = pen;
  const S = fx.SIGN;
  if (!brand) {
    // a custom name is written over a dark board hung on the glass
    P(S.x + 7, 0, 1, S.y, "#2a2436");
    P(S.x + S.w - 8, 0, 1, S.y, "#2a2436");
    P(S.x - 1, S.y - 1, S.w + 2, S.h + 10, O);
    A(S.x, S.y, S.w, S.h + 8, "#140f1e", 0.92);
    return;
  }
  const s = "AGENT LOUNGE";
  const k = 2;
  const w = textW(s) * k + 18;
  const x = S.x + Math.round((S.w - w) / 2);
  const y = S.y + 2;
  // the cup, a cyan tube
  const cells: [number, number][] = [];
  CUP2.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) if (r[i] === "#") cells.push([x + i * 2, y + j * 2]);
  });
  for (const [cx, cy] of cells) P(cx - 1, cy - 1, 4, 4, O);
  for (const [cx, cy] of cells) P(cx, cy, 2, 2, "#3ad8f0");
  for (const [cx, cy] of cells) pen.X(cx, cy, "#d8fcff");
  neonText(s, x + 18, y, k, "#ff4f9a", "#ffd6e8");
}

/** The concrete of the back wall: cast panels, their seams and the tie holes, as lofts have it. */
function concrete(pen: Pen, pal: HallPal, x0: number, x1: number) {
  const { P, X } = pen;
  P(x0, GY, x1 - x0, 62 - GY, pal.wall);
  for (let y = GY + 1; y < 62; y += 19) {
    P(x0, y, x1 - x0, 1, pal.seam);
    P(x0, y + 1, x1 - x0, 1, pal.wallHi);
  }
  for (let x = x0 + 30; x < x1; x += 32) {
    P(x, GY, 1, 62 - GY, pal.seam);
    P(x + 1, GY, 1, 62 - GY, pal.wallHi);
  }
  for (let y = GY + 7; y < 60; y += 19)
    for (let x = x0 + 8; x < x1 - 2; x += 16) {
      X(x, y, pal.hole);
      X(x, y + 9, pal.hole);
    }
}

/** The slatted wood behind the coffee bar. */
function slats(pen: Pen, pal: HallPal, x0: number, x1: number) {
  const { P, A } = pen;
  for (let x = x0; x < x1; x += 3) {
    P(x, GY, 2, 62 - GY, (x / 3) % 2 ? pal.slat[0] : pal.slat[1]);
    P(x + 2, GY, 1, 62 - GY, pal.slat[2]);
  }
  A(x0, GY, x1 - x0, 6, "#120a1a", 0.35);
  A(x0, GY + 6, x1 - x0, 4, "#120a1a", 0.15);
}

function drawWallDecor(pen: Pen, fx: Fixtures, pal: HallPal) {
  const { P, A, X, ell, rnd, reseed } = pen;
  // the menu screen over the coffee bar: drinks drawn, not written
  const B = fx.BOARD;
  P(B.x - 1, B.y - 1, B.w + 2, B.h + 2, O);
  P(B.x, B.y, B.w, B.h, "#16141e");
  P(B.x + 2, B.y + 2, B.w - 4, B.h - 4, "#0e1a26");
  P(B.x + 2, B.y + 2, B.w - 4, 3, "#ff6aa8");
  P(B.x + 2, B.y + 2, B.w - 4, 1, "#ffc0d8");
  const cup = (x: number, y: number, c: string) => {
    P(x, y, 5, 1, c);
    P(x, y, 1, 4, c);
    P(x + 4, y, 1, 4, c);
    P(x + 1, y + 4, 3, 1, c);
    P(x + 5, y + 1, 1, 2, c);
  };
  [["#62f0ff", 15], ["#ffc456", 11], ["#8ee59b", 17]].forEach(([c, len], i) => {
    const y = B.y + 8 + i * 5;
    cup(B.x + 5, y, c as string);
    for (let k = 0; k < (len as number); k += 2) X(B.x + 13 + k, y + 2, "#8a9cb0");
    P(B.x + B.w - 10, y + 1, 5, 3, c as string);
  });
  A(B.x + 2, B.y + 2, B.w - 4, 1, "#ffffff", 0.2);
  // a plain round clock
  const C = fx.CLOCK;
  ell(C.x, C.y, 6, 6, O);
  ell(C.x, C.y, 5, 5, "#efeaf2");
  for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) X(C.x + dx, C.y + dy, "#6a6478");
  // the shelves on the right: light wood floating on an LED strip, with gadgets
  const sx = fx.SHELVES.x + 1;
  const shelf = (y: number) => {
    P(sx - 1, y - 1, 50, 4, O);
    P(sx, y, 48, 2, pal.sill);
    P(sx, y, 48, 1, pal.sillHi);
    P(sx, y + 2, 48, 1, pal.led2);
  };
  shelf(22);
  shelf(37);
  // top shelf: a games console and its pad, a speaker, a little robot, a plant in a white pot
  P(sx + 2, 16, 12, 6, O);
  P(sx + 3, 17, 10, 5, "#e8e4ee");
  P(sx + 3, 17, 10, 1, "#ffffff");
  P(sx + 4, 19, 3, 1, "#62f0ff");
  X(sx + 11, 19, "#ff6aa8");
  P(sx + 15, 18, 7, 4, O);
  P(sx + 16, 19, 5, 3, "#2a2838");
  X(sx + 17, 20, "#ff6aa8");
  X(sx + 19, 20, "#62f0ff");
  P(sx + 24, 11, 7, 11, O);
  P(sx + 25, 12, 5, 10, "#2c2a3a");
  ell(sx + 27, 15, 2, 2, "#5a5670");
  ell(sx + 27, 19, 2, 1, "#5a5670");
  P(sx + 34, 13, 7, 9, O);
  P(sx + 35, 14, 5, 4, "#c8cfe0");
  X(sx + 36, 15, "#62f0ff");
  X(sx + 38, 15, "#62f0ff");
  P(sx + 35, 18, 5, 4, "#9aa3bf");
  X(sx + 37, 12, O);
  X(sx + 37, 11, "#ff6aa8");
  P(sx + 42, 17, 6, 5, O);
  P(sx + 43, 18, 4, 4, "#efeaf2");
  reseed(311);
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.36;
    for (let r = 1; r < 5; r++) X(sx + 45 + Math.round(Math.sin(a) * r), 17 - Math.round(Math.cos(a) * r), r > 2 ? "#5fa85a" : "#3f7a48");
  }
  // lower shelf: books, headphones on their stand, a camera; the trophy's spot stays free
  let bx = sx + 2;
  for (const c of ["#3a5a8a", "#e8e4ee", "#ff6aa8", "#3f7a48"]) {
    const h = 7 + Math.floor(rnd() * 3);
    P(bx, 37 - h, 3, h, O);
    P(bx, 37 - h + 1, 2, h - 1, c);
    X(bx, 37 - h + 1, lt(c, 0.4));
    bx += 3;
  }
  P(sx + 16, 26, 1, 11, "#2a2838");
  P(sx + 14, 36, 5, 1, "#2a2838");
  P(sx + 13, 27, 7, 2, O);
  P(sx + 13, 29, 2, 4, O);
  P(sx + 18, 29, 2, 4, O);
  X(sx + 13, 31, "#ff6aa8");
  X(sx + 19, 31, "#ff6aa8");
  P(sx + 24, 31, 9, 6, O);
  P(sx + 25, 32, 7, 5, "#3a3850");
  ell(sx + 28, 34, 2, 2, "#1a1424");
  X(sx + 28, 34, "#62f0ff");
  P(sx + 26, 30, 3, 1, O);
  // the LED panel for tokens a minute
  const M = fx.METER;
  P(M.x - 1, M.y - 1, M.w + 2, M.h + 2, O);
  P(M.x, M.y, M.w, M.h, "#06120c");
  P(M.x, M.y, M.w, 1, "#123020");
}
/** A chair's back, seen from the front or behind, `h` rows tall. */
export function chairBack(pen: Pen, cx: number, y: number, c: string, h: number) {
  const { P } = pen;
  P(cx - 7, y - 1, 14, h + 2, O);
  P(cx - 6, y, 12, h, c);
  P(cx - 6, y, 12, 1, lt(c, 0.3));
  P(cx - 5, y + 1, 1, h - 2, lt(c, 0.15));
  P(cx + 4, y + 1, 1, h - 1, dk(c, 0.3));
}

/** A near-row chair with nobody in it: the back, the seat and its foot. */
export function emptyChair(pen: Pen, cx: number, d: number, c: string) {
  chairBack(pen, cx, d + 26, c, 8);
  pen.P(cx - 5, d + 27, 10, 1, lt(c, 0.25));
  pen.P(cx - 1, d + 35, 2, 3, "#2a2840");
  pen.shadow(cx, d + 39, 7, 2, 0.4);
}

/** A bar stool: a round wooden seat on a black steel leg. */
export function stool(pen: Pen, x: number, y: number, c: string) {
  const { P, shadow } = pen;
  shadow(x + 3, y + 9, 4, 1, 0.45);
  P(x + 2, y + 3, 2, 6, "#24222e");
  P(x + 2, y + 3, 1, 6, "#4a4860");
  P(x, y + 8, 6, 1, "#24222e");
  P(x - 1, y - 1, 8, 4, O);
  P(x, y, 6, 2, c);
  P(x, y, 6, 1, lt(c, 0.35));
}

const PROPS = ["cactus", "duck", "cans", "books", "lamp", "none"] as const;

/** A desk prop in the design's style: what the agent picked, or what the desk got by chance. */
function prop(pen: Pen, kind: (typeof PROPS)[number] | "note", x: number, y: number) {
  const { P, X } = pen;
  if (kind === "books") {
    P(x, y + 1, 8, 5, O);
    P(x + 1, y + 2, 6, 1, "#c0485a");
    P(x + 1, y + 3, 6, 1, "#e0b050");
    P(x + 1, y + 4, 6, 1, "#4a7ab0");
  } else if (kind === "duck") {
    P(x, y + 1, 6, 5, O);
    P(x + 1, y + 2, 4, 3, "#ffd23a");
    P(x + 3, y, 3, 3, O);
    X(x + 4, y + 1, "#ffd23a");
    X(x + 6, y + 1, "#ff8a2a");
  } else if (kind === "cactus") {
    P(x, y + 2, 5, 4, O);
    P(x + 1, y + 3, 3, 3, "#c0603a");
    P(x + 1, y - 2, 3, 5, O);
    X(x + 2, y - 1, "#5a9a4a");
    X(x + 2, y, "#8cc06a");
    X(x + 2, y + 1, "#5a9a4a");
  } else if (kind === "cans") {
    P(x, y, 7, 6, O);
    P(x + 1, y + 1, 2, 4, "#4cc9f0");
    P(x + 4, y + 1, 2, 4, "#ff5d73");
    X(x + 1, y + 1, "#c8f0ff");
    X(x + 4, y + 1, "#ffc0c8");
  } else if (kind === "lamp") {
    P(x + 1, y - 3, 6, 4, O);
    P(x + 2, y - 2, 4, 2, "#ffcf6e");
    P(x + 3, y + 1, 1, 4, "#4a4458");
    P(x + 1, y + 4, 5, 2, O);
  } else if (kind === "note") {
    P(x, y, 6, 6, O);
    P(x + 1, y + 1, 4, 4, "#ff8ab8");
    P(x + 1, y + 1, 4, 1, "#ffc0d8");
    X(x + 2, y + 3, "#a03a6a");
    X(x + 3, y + 3, "#a03a6a");
  }
}

/** The desk prop of seat `i`: picked in the agent card, or by chance. */
export const propOf = (i: number, picked: number | undefined, own: number) => PROPS[(picked ?? own) % PROPS.length];

/** What stands behind the far row: the backs of its chairs. No rug: the desks are the pod. */
function podBase(pen: Pen, p: Pod, colors: (string | null)[]) {
  [0, 1].forEach((s) => {
    const cx = p.x + 15 + s * 40;
    const c = colors[s];
    if (!c) return chairBack(pen, cx, p.d - 9, "#4a4660", 8);
    pen.shadow(cx, p.d - 2, 9, 2, 0.35);
    chairBack(pen, cx, p.d - 17, dk(c, 0.55), 14);
  });
}

const DESK = { top: "#d2ccda", hi: "#ebe7f1", grain: "#c8c1d2", seam: "#968fa6", face: "#a39cb2", faceHi: "#bdb6ca", edge: "#7e7790", leg: "#24222e" };

/** Four white desks pushed together on black steel legs, slim monitors, a planter with a plant and a lamp between. */
function podMid(pen: Pen, p: Pod, colors: (string | null)[], props: ((typeof PROPS)[number] | null)[]) {
  const { P, X, shadow, reseed, fronds } = pen;
  const ox = p.x;
  const D = p.d;
  const w = POD_W;
  const sx = [ox + 15, ox + 55];
  shadow(ox + w / 2, D + 32, w / 2 + 4, 3, 0.4);
  P(ox - 1, D - 1, w + 2, 31, O);
  P(ox, D, w, 24, DESK.top);
  P(ox, D, w, 1, DESK.hi);
  P(ox, D + 1, 1, 22, DESK.hi);
  P(ox, D + 11, w, 1, DESK.seam);
  P(ox, D + 12, w, 1, DESK.grain);
  P(ox + 34, D + 1, 1, 23, DESK.grain);
  P(ox, D + 24, w, 5, DESK.face);
  P(ox, D + 24, w, 1, DESK.faceHi);
  P(ox + w - 1, D + 1, 1, 28, DESK.edge);
  for (const lx of [ox + 2, ox + w - 4]) {
    P(lx, D + 29, 2, 3, DESK.leg);
    P(lx - 1, D + 31, 4, 1, DESK.leg);
  }
  [0, 1].forEach((s) => {
    const cx = sx[s];
    P(cx - 6, D + 1, 12, 3, O);
    P(cx - 5, D + 1, 10, 2, "#2c2a38");
    for (let k = 0; k < 5; k++) X(cx - 4 + k * 2, D + 1, "#6e6c84");
    P(cx - 8, D + 3, 16, 9, O);
    P(cx - 7, D + 4, 14, 7, "#3a3848");
    P(cx - 7, D + 4, 14, 1, "#5e5c74");
    P(cx - 1, D + 6, 2, 2, "#6e6c86");
  });
  [2, 3].forEach((s) => {
    const cx = sx[s - 2];
    if (!colors[s]) return prop(pen, "note", cx - 3, D + 15);
    P(cx - 9, D + 6, 18, 12, O);
    P(cx - 8, D + 7, 16, 10, "#1e1d2a");
    P(cx - 7, D + 8, 14, 8, "#16122a");
    P(cx - 1, D + 18, 2, 2, "#3a3850");
    P(cx - 4, D + 19, 8, 2, O);
    P(cx - 3, D + 19, 6, 1, "#4a4860");
  });
  props.forEach((k, s) => {
    if (!k || !colors[s]) return;
    const x = s % 2 ? ox + w - 8 : ox + 2;
    prop(pen, k, x, s < 2 ? D + 4 : D + 15);
  });
  // the planter between the four desks, with a plant and an arm lamp
  const mx = ox + 35;
  P(mx - 6, D + 3, 12, 20, O);
  P(mx - 5, D + 4, 10, 18, "#3a3846");
  P(mx - 5, D + 4, 10, 1, "#5a586a");
  P(mx + 3, D + 5, 1, 17, "#2a2834");
  P(mx - 4, D + 5, 8, 3, "#3a2a20");
  P(mx - 1, D - 7, 1, 11, O);
  P(mx, D - 7, 1, 11, "#2c2a38");
  P(mx - 6, D - 9, 9, 3, O);
  P(mx - 5, D - 8, 7, 1, "#2c2a38");
  P(mx - 5, D - 7, 6, 1, "#fff0b0");
  reseed(ox * 13 + 7);
  fronds(mx, D + 8, 7, 8, 70);
  [2, 3].forEach((s) => {
    if (!colors[s]) emptyChair(pen, sx[s - 2], D, "#4a4660");
  });
}

const TERRAZZO = { top: "#e6e1ea", fleck: ["#c8a0b0", "#9ab0c8", "#b8b2c4"] };

/** The coffee bar along the wall: a terrazzo top on slatted wood, a grinder, cups and a jar of beans. */
function backCounter(pen: Pen, pal: HallPal) {
  const { P, X, box, rnd, reseed } = pen;
  box(10, 54, 64, 14, TERRAZZO.top, pal.slat[1], 5);
  reseed(91);
  for (let k = 0; k < 18; k++) X(11 + Math.floor(rnd() * 62), 55 + Math.floor(rnd() * 4), TERRAZZO.fleck[k % 3]);
  for (let x = 12; x < 72; x += 3) P(x, 60, 1, 7, pal.slat[2]);
  P(38, 45, 6, 10, O);
  P(39, 46, 4, 3, "#2c2a38");
  P(39, 49, 4, 5, "#3a3850");
  P(39, 46, 4, 1, "#5a5870");
  for (let i = 0; i < 3; i++) {
    P(48 + i * 5, 52 - (i === 1 ? 3 : 0), 4, 4, O);
    P(49 + i * 5, 53 - (i === 1 ? 3 : 0), 2, 2, "#f6f2f8");
  }
  P(62, 47, 8, 8, O);
  P(63, 48, 6, 7, "#c8dce4");
  P(63, 51, 6, 4, "#5a3a24");
  P(63, 48, 6, 1, "#ffffff");
}

/** The espresso machine on the back counter, gold once the golden machine is earned, its lamp blinking. */
export function espresso(pen: Pen, t: number, gold: boolean) {
  const { P, X } = pen;
  const body = gold ? "#d9a93a" : "#b8b8d0";
  P(16, 44, 18, 12, O);
  P(17, 45, 16, 10, body);
  P(17, 45, 16, 1, gold ? "#ffe08a" : "#e8e8f8");
  P(17, 50, 16, 1, gold ? "#a87a20" : "#7a7a98");
  P(31, 46, 1, 8, gold ? "#a87a20" : "#7a7a98");
  X(20, 47, Math.floor(t * 2) % 2 ? "#ff4a5a" : "#7a1f2a");
  X(23, 47, "#8ee59b");
  P(19, 51, 3, 4, "#3a3850");
  P(26, 51, 3, 4, "#3a3850");
}

/** The barista's counter: terrazzo on slatted wood, a cake under glass, a till and a cup; stools in front. */
function frontCounter(pen: Pen, pal: HallPal) {
  const { P, A, X, box, shadow, rnd, reseed } = pen;
  shadow(44, 98, 36, 3, 0.4);
  box(10, 78, 68, 20, TERRAZZO.top, pal.slat[0], 6);
  reseed(57);
  for (let k = 0; k < 22; k++) X(11 + Math.floor(rnd() * 66), 79 + Math.floor(rnd() * 5), TERRAZZO.fleck[k % 3]);
  for (let x = 12; x < 77; x += 3) P(x, 85, 1, 12, pal.slat[2]);
  P(10, 96, 68, 1, "#24222e");
  P(15, 72, 10, 7, O);
  P(16, 73, 8, 5, "#d8eef0");
  A(16, 73, 8, 5, "#ffffff", 0.15);
  P(17, 75, 6, 3, "#e07a8a");
  P(17, 75, 6, 1, "#fff0f0");
  P(15, 78, 10, 1, "#efe4cc");
  P(30, 74, 5, 5, O);
  P(31, 75, 3, 4, "#a8e0f0");
  X(32, 76, "#ffc456");
  X(31, 77, "#8ee59b");
  P(56, 71, 14, 8, O);
  P(57, 72, 12, 6, "#2c2a38");
  P(58, 73, 6, 2, "#62f0ff");
  P(57, 72, 12, 1, "#5d5c80");
  X(66, 75, "#ff6aa8");
  P(46, 75, 4, 4, O);
  P(47, 76, 2, 2, "#f6f2f8");
  X(47, 75, "#5a3020");
  for (const s of barSeats().slice(0, 4)) stool(pen, s.x - 3, s.y, "#c8935e");
}

/** The lounge: a velvet sofa, an arc lamp, a round wooden table and two bean bags, straight on the planks. */
function lounge(pen: Pen, fx: Fixtures, pal: HallPal) {
  const { P, X, ell, shadow } = pen;
  const L = fx.LOUNGE.x + 2 - 248;
  const x = (v: number) => v + L;
  const [sf, sfHi, sfLo] = pal.sofa;
  // the arc lamp: a black pole bending over the sofa to a dome
  shadow(x(252), 106, 5, 2, 0.5);
  P(x(249), 104, 7, 2, O);
  P(x(250), 104, 5, 1, "#3a3850");
  P(x(251), 70, 2, 35, O);
  P(x(252), 71, 1, 33, "#3a3850");
  P(x(251), 68, 10, 2, O);
  P(x(252), 68, 8, 1, "#3a3850");
  P(x(258), 69, 7, 4, O);
  P(x(259), 69, 5, 2, "#2c2a38");
  P(x(259), 71, 5, 1, "#fff0c0");
  // the sofa
  shadow(x(282), 108, 28, 3, 0.45);
  P(x(256), 85, 52, 24, O);
  P(x(257), 86, 50, 10, sf);
  P(x(257), 86, 50, 1, sfHi);
  P(x(257), 87, 50, 1, lt(sf, 0.12));
  for (let v = 264; v < 304; v += 9) P(x(v), 88, 1, 7, sfLo);
  P(x(260), 95, 44, 8, lt(sf, 0.08));
  P(x(260), 95, 44, 1, sfHi);
  P(x(281), 95, 1, 8, sfLo);
  P(x(260), 102, 44, 1, sfLo);
  P(x(257), 103, 50, 5, sfLo);
  P(x(257), 103, 50, 1, sf);
  P(x(256), 89, 5, 19, O);
  P(x(257), 90, 3, 17, sf);
  P(x(257), 90, 3, 1, sfHi);
  P(x(303), 89, 5, 19, O);
  P(x(304), 90, 3, 17, sfLo);
  P(x(304), 90, 3, 1, sf);
  P(x(258), 108, 2, 2, "#24222e");
  P(x(304), 108, 2, 2, "#24222e");
  P(x(262), 90, 7, 6, O);
  P(x(263), 91, 5, 4, "#ff8ab8");
  P(x(263), 91, 5, 1, "#ffc0d8");
  P(x(270), 90, 7, 6, O);
  P(x(271), 91, 5, 4, "#ffc456");
  P(x(271), 91, 5, 1, "#ffe0a0");
  // the round table, light wood on a black foot
  shadow(x(282), 129, 15, 3, 0.45);
  ell(x(282), 121, 15, 5, O);
  ell(x(282), 121, 14, 4, "#a8784e");
  ell(x(282), 120, 14, 3, "#c8966a");
  P(x(281), 124, 2, 4, "#24222e");
  P(x(277), 127, 10, 1, "#24222e");
  P(x(276), 117, 12, 6, O);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) P(x(277) + i * 2, 118 + j * 2, 2, 2, (i + j) & 1 ? "#ff8ab8" : "#f4e8d8");
  X(x(279), 117, "#1a1020");
  X(x(279), 116, "#1a1020");
  X(x(285), 117, "#ffffff");
  X(x(285), 116, "#f4e8d8");
  P(x(291), 118, 4, 4, O);
  P(x(292), 119, 2, 2, "#f6f2f8");
  const bean = (cx: number, cy: number, c: string) => {
    shadow(cx, cy + 5, 8, 2, 0.45);
    ell(cx, cy, 8, 6, O);
    ell(cx, cy, 7, 5, c);
    ell(cx - 1, cy - 2, 5, 2, lt(c, 0.2));
    X(cx - 3, cy - 3, lt(c, 0.5));
    P(cx - 5, cy + 3, 10, 1, dk(c, 0.3));
  };
  bean(x(266), 140, "#c8a478");
  bean(x(297), 140, "#4f7f9e");
  const a = fx.ARCADE;
  shadow(a.x + 9, a.y + 30, 10, 2, 0.5);
  P(a.x, a.y, 18, 30, O);
  P(a.x + 1, a.y + 1, 16, 28, "#2a1a48");
  P(a.x + 1, a.y + 1, 16, 1, "#4a3478");
  P(a.x + 16, a.y + 2, 1, 27, "#1a1030");
  P(a.x + 2, a.y + 2, 14, 4, "#ff6aa8");
  P(a.x + 2, a.y + 2, 14, 1, "#ffc0d8");
  P(a.x + 3, a.y + 8, 12, 9, "#0a0a14");
  P(a.x + 4, a.y + 9, 10, 7, "#1a2a4a");
  P(a.x + 2, a.y + 19, 14, 3, "#3a2a60");
  X(a.x + 5, a.y + 19, "#ff4a5a");
  X(a.x + 11, a.y + 20, "#62f0ff");
  X(a.x + 13, a.y + 20, "#ffc456");
}

/** The little game on the arcade's screen, never the same twice in a row. */
export function arcadeScreen(pen: Pen, fx: Fixtures, t: number) {
  const a = fx.ARCADE;
  const { P, X } = pen;
  P(a.x + 4, a.y + 9, 10, 7, "#1a2a4a");
  const k = Math.floor(t * 4);
  X(a.x + 5 + (k % 8), a.y + 14, "#62f0ff");
  X(a.x + 10 - (k % 5), a.y + 11, "#ff6aa8");
  X(a.x + 8, a.y + 9 + (k % 6), "#ffc456");
  P(a.x + 4, a.y + 15, 10, 1, "#8ee59b");
}

/** A tall plant in a white cylinder pot. */
function bigPlant(pen: Pen, cx: number, by: number) {
  const { P, shadow, reseed, fronds } = pen;
  shadow(cx, by, 8, 2, 0.5);
  reseed(cx * 17);
  fronds(cx, by - 10, 10, 17, 78);
  P(cx - 6, by - 11, 12, 11, O);
  P(cx - 5, by - 10, 10, 10, "#ece8f0");
  P(cx - 5, by - 10, 10, 1, "#ffffff");
  P(cx + 2, by - 9, 2, 9, "#c4bed0");
  P(cx - 4, by - 9, 8, 1, "#3a2a20");
}

/** A round marble table on a black foot, with two stools. */
function bistro(pen: Pen, cx: number, cy: number) {
  const { P, X, ell, shadow } = pen;
  shadow(cx, cy + 9, 9, 2, 0.45);
  P(cx - 1, cy + 3, 2, 6, "#24222e");
  P(cx - 4, cy + 8, 8, 1, "#24222e");
  ell(cx, cy, 8, 3, O);
  ell(cx, cy, 7, 2, "#eeeaf2");
  P(cx - 7, cy, 14, 1, "#c4bed0");
  P(cx - 2, cy - 3, 4, 3, O);
  X(cx - 1, cy - 2, "#f6f2f8");
  X(cx, cy - 2, "#5a3020");
  stool(pen, cx - 16, cy, "#c8935e");
  stool(pen, cx + 10, cy, "#c8935e");
}

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

const DIM: Record<string, number> = { night: 1, dusk: 1, dawn: 0.8, day: 0.4 };

/**
 * Everything that never moves, rendered once per layout and theme: the walls, the glass wall with the outside at this
 * hour, the floor and its light, the pods with their chairs and props, the counter, the lounge and the lamps.
 */
export function buildRoom(
  lay: CafeLayout,
  agents: AgentDef[],
  seed = 1,
  th: Theme = THEMES.cafe,
  props: (number | undefined)[] = [],
  brand = true,
): HallArt {
  const W = lay.width;
  const H = lay.height;
  const FB = lay.front;
  const FL = WALL_H;
  const fx = fixturesOf(lay);
  const pal = hallPal(th);
  const [base, g] = canvas(W, H);
  const pen = hallPen(g);
  const { P, A, X, glow, rnd, reseed } = pen;
  const win = fx.WINDOWS[0];

  // the floor: long light planks, quiet grain
  reseed(4242);
  for (let y = FL; y < FB; y += 6) {
    let x = 9 - ((y * 13) % 41);
    while (x < W - 9) {
      const len = 34 + Math.floor(rnd() * 40);
      const c = pal.floor[Math.floor(rnd() * pal.floor.length)];
      P(x, y, len, 6, c);
      P(x, y, len, 1, lt(c, 0.1));
      P(x, y + 5, len, 1, dk(c, 0.28));
      P(x, y + 1, 1, 4, dk(c, 0.22));
      const gx = x + 3 + Math.floor(rnd() * Math.max(1, len - 14));
      P(gx, y + 2 + Math.floor(rnd() * 2), 8 + Math.floor(rnd() * 8), 1, dk(c, 0.07));
      x += len;
    }
  }
  // the ceiling with its LED strip, the concrete, the slatted wood behind the bar, the skirting
  P(0, 0, W, 3, pal.ceil);
  P(0, 2, W, 1, pal.ceil2);
  concrete(pen, pal, 0, W);
  slats(pen, pal, 9, win.x - 3);
  P(win.x - 3, GY, 1, 62 - GY, O);
  P(0, 3, W, 1, pal.led);
  P(0, 62, W, 4, pal.skirt);
  P(0, 62, W, 1, pal.skirtHi);
  P(0, 65, W, 1, O);
  A(0, 66, W, 2, "#12061a", 0.4);
  A(0, 68, W, 2, "#12061a", 0.18);

  const [wc, wa] = windowLight(th);
  drawWindow(g, pen, fx, th, pal);
  drawSign(pen, fx, brand);
  drawWallDecor(pen, fx, pal);

  // side walls
  const sideWall = (x: number, flip: boolean) => {
    const [a, b, c, d, e] = pal.side;
    for (let y = 0; y < H; y++)
      for (let i = 0; i < 9; i++) X(flip ? x + 8 - i : x + i, y, i < 4 ? (i === 0 ? a : i === 3 ? O : b) : i === 4 ? c : d);
    for (let y = 6; y < H; y += 24) P(flip ? x + 5 : x + 1, y, 3, 1, e);
    P(flip ? x : x + 4, FL - 4, 5, 4, pal.skirt);
  };
  sideWall(0, false);
  sideWall(W - 9, true);
  A(9, FL, 3, FB - FL, "#12061a", 0.3);
  A(W - 12, FL, 3, FB - FL, "#12061a", 0.3);

  const colors = (p: number) => [0, 1, 2, 3].map((s) => agents[p * 4 + s]?.color ?? null);
  lay.pods.forEach((p, k) => podBase(pen, p, colors(k)));
  lounge(pen, fx, pal);

  // the glass wall's light on the floor, with the shadows of its bars
  const bars = mullions(win.x, win.w).map((m) => (m + 1 - win.x) / win.w);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = wc;
  for (let y = FL; y < FL + 70; y++) {
    const t = (y - FL) / 70;
    const l = win.x + t * 30;
    const r = win.x + win.w + t * 40;
    for (let x = Math.round(l); x < Math.round(r); x++) {
      const u = (x - l) / (r - l);
      if (bars.some((b) => Math.abs(u - b) < 0.012)) continue;
      if (t > 0.6 && (x + y) & 1) continue;
      if (t > 0.85 && (x + 2 * y) % 4) continue;
      g.globalAlpha = wa * (1 - t * 0.6);
      g.fillRect(x, y, 1, 1);
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  glow(win.x + win.w / 2, 34, win.w / 2 + 6, 30, wc, wa * 0.25);

  backCounter(pen, pal);
  bigPlant(pen, 20, FB);
  bigPlant(pen, W - 20, FB);
  bistro(pen, fx.BISTRO.x, fx.BISTRO.y);
  const door = doorOf(lay);
  P(door.x + 3, FB - 7, 32, 7, O);
  P(door.x + 4, FB - 6, 30, 6, "#2c2a38");
  for (let x = door.x + 5; x < door.x + 33; x += 2) X(x, FB - 4, "#3e3c4e");
  P(0, FB, W, H - FB, O);
  P(0, FB + 1, door.x, 5, pal.cap);
  P(0, FB + 1, door.x, 1, pal.capHi);
  P(door.x + 38, FB + 1, W - door.x - 38, 5, pal.cap);
  P(door.x + 38, FB + 1, W - door.x - 38, 1, pal.capHi);
  P(door.x, FB, 1, 8, O);
  P(door.x + 37, FB, 1, 8, O);
  P(door.x + 1, FB, 36, 8, pal.slat[1]);
  P(door.x + 1, FB, 36, 1, pal.slat[0]);

  // what stands in front of the far row
  const [mid, gm] = canvas(W, H);
  const mp = hallPen(gm);
  frontCounter(mp, pal);
  lay.pods.forEach((p, k) => {
    const own = [0, 1, 2, 3].map((s) => {
      const i = k * 4 + s;
      return agents[i] ? propOf(i, props[i], propIndex(seed, i)) : null;
    });
    podMid(mp, p, colors(k), own);
  });

  // the light: darker corners and front, warm lamps, the neon
  const k = DIM[th.light ?? "night"] ?? 1;
  const [dim, gd] = canvas(W, H);
  gd.fillStyle = "#ffffff";
  gd.fillRect(0, 0, W, H);
  gd.globalCompositeOperation = "multiply";
  const mul = (x: number, y: number, w: number, h: number, c: string) => {
    gd.fillStyle = mix("#ffffff", c, k);
    gd.fillRect(x, y, w, h);
  };
  mul(0, FL, W, FB - FL, "#d6c8dc");
  mul(0, FB - 34, W, 34, "#dcd0e0");
  mul(0, FB - 16, W, 16, "#dcd0e0");
  mul(0, 0, 40, H, "#e0d4e4");
  mul(W - 40, 0, 40, H, "#e0d4e4");

  const lampC = th.lampGlow;
  const [lamps, gl] = canvas(W, H);
  const lp = hallPen(gl);
  lay.pods.forEach((p) => {
    const mx = p.x + 35;
    lp.glow(mx, p.d + 4, 34, 15, lampC, 0.16);
    lp.glow(mx - 2, p.d - 6, 6, 3, "#fff0b0", 0.4);
  });
  const L = fx.LOUNGE.x + 2;
  lp.glow(L + 13, 76, 16, 10, "#ffc070", 0.25);
  lp.glow(L + 10, 106, 30, 14, lampC, 0.13);
  lp.glow(44, 76, 40, 14, lampC, 0.12);
  for (const x of [28, 58]) lp.glow(x, 38, 10, 7, "#ffc070", 0.22);

  const [neon, gn] = canvas(W, H);
  const np = hallPen(gn);
  const S = fx.SIGN;
  if (brand) np.glow(S.x + S.w / 2, S.y + 7, S.w / 2 + 6, 10, "#ff4f9a", 0.16);
  np.glow(fx.BOARD.x + fx.BOARD.w / 2, fx.BOARD.y + fx.BOARD.h / 2, 28, 18, "#62f0ff", 0.07);
  gn.globalCompositeOperation = "lighter";
  for (const [y, a] of [[4, 0.22], [5, 0.12], [6, 0.06]] as const) {
    gn.globalAlpha = a;
    gn.fillStyle = pal.led;
    gn.fillRect(0, y, W, 1);
  }
  const sh = fx.SHELVES;
  for (const y of [25, 40]) {
    gn.globalAlpha = 0.18;
    gn.fillStyle = pal.led2;
    gn.fillRect(sh.x, y, sh.w, 2);
    gn.globalAlpha = 0.08;
    gn.fillRect(sh.x, y + 2, sh.w, 2);
  }
  gn.globalAlpha = 1;
  gn.globalCompositeOperation = "source-over";
  const a = fx.ARCADE;
  np.glow(a.x + 9, a.y + 8, 16, 12, "#ff6aa8", 0.14);
  np.glow(a.x + 9, a.y + 32, 16, 4, "#ff6aa8", 0.12);

  // black dome pendants over the counter
  const [post, gp] = canvas(W, H);
  const pp = hallPen(gp);
  for (const x of [28, 58]) {
    pp.P(x, 0, 1, 29, "#16121e");
    pp.P(x - 4, 28, 9, 4, O);
    pp.P(x - 3, 28, 7, 3, "#2c2a38");
    pp.P(x - 3, 28, 7, 1, "#4a4860");
    pp.P(x - 2, 31, 5, 1, "#fff0c0");
  }
  return { base, mid, dim, lamps, neon, post, brand };
}
