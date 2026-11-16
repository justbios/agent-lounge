import { CafeLayout, POD_W, Pod, WALL_H } from "@/lib/cafe/layout";
import { AgentDef } from "@/lib/types";
import { propIndex } from "./desk";
import { hallPal, HallPal } from "./hallPal";
import { O, Pen, dk, hallPen, lt } from "./hallPen";
import { Ctx } from "./pixel";
import { Fixtures, barSeats, doorOf, fixturesOf } from "./room";
import { mix } from "./street/px";
import { THEMES, Theme, keepsSky } from "./theme";
import { drawSkyline } from "./windows";

/** The hall painted once per layout and theme, in the layers the frame puts the moving parts between. */
export interface HallArt {
  /** floor, walls, window, rugs, the back counter, the lounge and the far row's chairs */
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

const WY = 5;
const WH = 40;
/** the ground line inside the window, where the city stands */
const GROUND = WY + WH - 3;

const half = (y: number, R: number, top: number, RY: number) => {
  if (y < top) return -1;
  if (y >= top + RY) return R;
  const t = (top + RY - y) / RY;
  return Math.floor(R * Math.sqrt(1 - t * t));
};

/** Clips to the glass of the arched window at `wx`, for what is seen through it. */
export function archClip(g: Ctx, wx: number, ww: number) {
  const wcx = wx + ww / 2;
  g.beginPath();
  for (let y = WY + 3; y < WY + WH - 2; y++) {
    const hi = half(y, 23, WY + 3, 12);
    if (hi > 0) g.rect(wcx - hi, y, hi * 2, 1);
  }
  g.clip();
}
/** How far the window's view sits below the old flat windows' view, which weather and skylines are drawn for. */
export const VIEW_DY = GROUND - 32;

/** Sky colours spread over the glass from the theme's five. */
function skyRows(th: Theme): string[] {
  const s = th.sky;
  return Array.from({ length: 10 }, (_, i) => {
    const f = (i / 9) * (s.length - 1);
    const b = Math.min(s.length - 2, Math.floor(f));
    return mix(s[b], s[b + 1], f - b);
  });
}

const CITY = {
  night: { far: "#1e2448", near: "#141634", edge: "#22264a", lit: ["#ffc870", "#7fd4ff"], share: 0.38 },
  dusk: { far: "#7a3a68", near: "#2c1a3c", edge: "#3c2650", lit: ["#ffc870", "#ff8a5a"], share: 0.42 },
  dawn: { far: "#6a4a7a", near: "#2a2748", edge: "#3a3560", lit: ["#ffd27a", "#ffb27a"], share: 0.2 },
  day: { far: "#8aa8cc", near: "#4f6388", edge: "#5f75a0", lit: ["#9db6d4", "#7f97b8"], share: 0.4 },
} as const;

function cityView(pen: Pen, wx: number, ww: number, th: Theme) {
  const { P, X, rnd, reseed } = pen;
  const c = CITY[th.light ?? "night"];
  reseed(77);
  for (let x = wx + 3; x < wx + ww - 3; x += 3) {
    const h = 4 + Math.floor(rnd() * 9);
    P(x, GROUND - h, 3, h, c.far);
  }
  for (let x = wx + 3; x < wx + ww - 3; ) {
    const bw = 4 + Math.floor(rnd() * 5);
    const h = 6 + Math.floor(rnd() * 12);
    const top = GROUND - h;
    const w = Math.min(bw, wx + ww - 3 - x);
    P(x, top, w, h, c.near);
    P(x, top, 1, h, c.edge);
    if (th.snowCaps) P(x, top, w, 1, "#e6ecff");
    for (let yy = top + 2; yy < GROUND - 1; yy += 2)
      for (let xx = x + 1; xx < x + bw - 1 && xx < wx + ww - 3; xx += 2)
        if (rnd() < c.share) X(xx, yy, rnd() < 0.7 ? c.lit[0] : c.lit[1]);
    if (rnd() < 0.4) {
      P(x + 1, top - 3, 1, 3, c.near);
      X(x + 1, top - 4, "#ff5a6a");
    }
    x += bw;
  }
}

function drawWindow(g: Ctx, pen: Pen, fx: Fixtures, th: Theme, pal: HallPal) {
  const { P, A, X, ell } = pen;
  const { x: wx, w: ww } = fx.WINDOWS[0];
  const wcx = wx + ww / 2;
  const light = th.light ?? "night";
  P(wx - 12, 3, ww + 24, 2, "#c8a050");
  P(wx - 12, 3, ww + 24, 1, "#f0d080");
  X(wx - 13, 3, O);
  X(wx + ww + 12, 3, O);
  const sky = skyRows(th);
  for (let y = WY; y < WY + WH; y++) {
    const ho = half(y, 26, WY, 14);
    if (ho < 0) continue;
    P(wcx - ho - 1, y, (ho + 1) * 2, 1, O);
    P(wcx - ho, y, ho * 2, 1, pal.frame);
    X(wcx - ho, y, pal.frameHi);
    const hi = half(y, 23, WY + 3, 12);
    if (hi > 0 && y < WY + WH - 2) {
      const t = (y - WY - 3) / (WH - 5);
      const f = t * (sky.length - 1);
      const b = Math.floor(f);
      for (let x = wcx - hi; x < wcx + hi; x++) X(x, y, f - b > 0.5 && (x + y) & 1 ? sky[Math.min(sky.length - 1, b + 1)] : sky[b]);
      X(wcx - hi - 1, y, pal.frameIn);
    }
  }
  g.save();
  archClip(g, wx, ww);
  const spooky = th.skyline === "spooky";
  const planet = th.skyline === "planet";
  if (light === "night" || light === "dusk" || keepsSky(th)) {
    for (const [dx, dy] of [[12, 7], [20, 4], [37, 6], [29, 10], [44, 9], [17, 13], [8, 15], [40, 16]]) X(wx + dx, WY + dy, th.stars);
  }
  if (spooky) {
    ell(wx + 16, WY + 13, 5, 5, "#e8913a");
    ell(wx + 15, WY + 12, 4, 4, "#ffb347");
  } else if (!planet) {
    if (light === "night") {
      ell(wx + 35, WY + 11, 4, 4, "#f4ecc8");
      ell(wx + 37, WY + 10, 3, 3, sky[1]);
    } else if (light === "day") {
      ell(wx + 14, WY + 13, 4, 4, "#ffd84a");
      ell(wx + 14, WY + 13, 3, 3, "#fff3b0");
    } else {
      const sx = light === "dusk" ? wx + 38 : wx + 14;
      ell(sx, GROUND - 3, 6, 6, "#ffcf7a");
      ell(sx, GROUND - 3, 4, 4, "#ffe6a8");
      if (light === "dusk") {
        X(wx + 25, WY + 5, "#fff6d8");
        X(wx + 24, WY + 5, "#a89ccc");
        X(wx + 26, WY + 5, "#a89ccc");
      }
    }
  }
  if (th.skyline === "city") cityView(pen, wx, ww, th);
  else {
    g.translate(0, VIEW_DY);
    drawSkyline(g, wx + 3, ww - 6, 0, th);
  }
  g.restore();
  P(wcx - 1, WY + 2, 2, WH - 3, pal.mullion);
  P(wcx - 1, WY + 2, 1, WH - 3, pal.mullionHi);
  P(wx + 3, WY + 15, ww - 6, 2, pal.mullion);
  P(wx + 3, WY + 15, ww - 6, 1, pal.mullionHi);
  for (let i = 0; i < 9; i++) {
    A(wx + 8 + i, WY + 18 + i, 1, 1, "#ffffff", 0.22);
    A(wx + 11 + i, WY + 18 + i, 1, 1, "#ffffff", 0.12);
  }
  P(wx - 4, WY + WH - 1, ww + 8, 4, O);
  P(wx - 3, WY + WH - 1, ww + 6, 2, pal.sill);
  P(wx - 3, WY + WH - 1, ww + 6, 1, pal.sillHi);
  P(wx - 3, WY + WH + 1, ww + 6, 1, pal.mullion);
  const curtain = (x: number, flip: boolean) => {
    for (let y = 5; y < 50; y++) {
      const tie = y > 26 && y < 31;
      const w = y < 26 ? 9 : y < 31 ? 5 : 6 + Math.min(4, (y - 31) >> 2);
      for (let i = 0; i < w; i++) {
        const xx = flip ? x + 9 - i : x + i;
        const fold = (i + (y >> 3)) % 3;
        X(xx, y, i === w - 1 ? O : pal.curtain[fold]);
      }
      if (tie) P(flip ? x + 4 : x + 1, y, 5, 1, pal.tie);
    }
  };
  curtain(wx - 11, false);
  curtain(wx + ww + 2, true);
}

/** The light from the window falling on the floor, warm at sunset, white by day, faint and blue by night. */
function windowLight(th: Theme): [string, number] {
  if (keepsSky(th)) return [th.windowGlow, 0.1];
  const light = th.light ?? "night";
  if (light === "day") return ["#fff1cc", 0.24];
  if (light === "dawn") return ["#ffb27a", 0.18];
  if (light === "dusk") return ["#ff9850", 0.2];
  return ["#6f8cff", 0.09];
}

function drawSign(g: Ctx, pen: Pen, fx: Fixtures, brand: boolean) {
  const { P, X, text, textW } = pen;
  const { x: nx, y: ny, w: nw, h: nh } = fx.SIGN;
  P(nx - 1, ny - 1, nw + 2, nh + 2, O);
  P(nx, ny, nw, nh, "#1d1228");
  P(nx, ny, nw, 1, "#33224a");
  P(nx, ny + nh - 1, nw, 1, "#140c1c");
  for (const [x, y] of [[nx + 2, ny + 2], [nx + nw - 3, ny + 2], [nx + 2, ny + nh - 3], [nx + nw - 3, ny + nh - 3]]) X(x, y, "#5d5c80");
  P(nx + 14, 0, 1, ny - 1, "#3a2c48");
  P(nx + nw - 15, 0, 1, ny - 1, "#3a2c48");
  if (!brand) return;
  const s = "AGENT LOUNGE";
  const tx = nx + Math.round((nw - textW(s)) / 2) + 3;
  const ty = ny + 4;
  g.globalAlpha = 0.5;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(s, tx + dx, ty + dy, "#ff3d8f");
  g.globalAlpha = 1;
  text(s, tx, ty, "#ffd6e8");
  const cup = (x: number, y: number, c: string) => {
    P(x, y + 2, 5, 1, c);
    P(x, y + 2, 1, 4, c);
    P(x + 4, y + 2, 1, 4, c);
    P(x + 1, y + 6, 3, 1, c);
    P(x + 5, y + 3, 1, 2, c);
    X(x + 1, y, c);
    X(x + 3, y - 1, c);
  };
  g.globalAlpha = 0.45;
  cup(tx - 9, ty, "#2ab8d8");
  cup(tx - 8, ty + 1, "#2ab8d8");
  g.globalAlpha = 1;
  cup(tx - 8, ty, "#c8fcff");
  g.globalAlpha = 0.5;
  P(nx + 12, ny + 13, nw - 24, 3, "#2ab8d8");
  g.globalAlpha = 1;
  P(nx + 12, ny + 14, nw - 24, 1, "#c8fcff");
  text("O", nx + 31, ny + 13, "#1d1228");
}

function drawWallDecor(pen: Pen, fx: Fixtures, width: number) {
  const { P, A, X, ell, text, rnd, reseed } = pen;
  const B = fx.BOARD;
  P(B.x, B.y, 46, 31, O);
  P(B.x + 1, B.y + 1, 44, 29, "#8a5a38");
  P(B.x + 1, B.y + 1, 44, 1, "#b07a4e");
  P(B.x + 3, B.y + 3, 40, 25, "#22322c");
  A(B.x + 3, B.y + 3, 40, 2, "#ffffff", 0.05);
  text("MEHY", B.x + 14, B.y + 5, "#e8e4d4");
  [[6, 13, 18], [6, 17, 14], [6, 21, 20], [6, 25, 12]].forEach(([x, y, w], i) => {
    for (let k = 0; k < w; k += 2) X(B.x + x + k, B.y + y, "#b8c0b0");
    P(B.x + 35, B.y + y, 5, 1, ["#ffc456", "#ff8ab8", "#8ee59b", "#62f0ff"][i]);
  });
  P(B.x + 1, B.y + 30, 44, 2, "#5e3a24");
  const F = fx.PRINT;
  P(F.x, F.y, 26, 30, O);
  P(F.x + 1, F.y + 1, 24, 28, "#d8b878");
  P(F.x + 3, F.y + 3, 20, 24, "#2a2252");
  ["#3a2a5e", "#5a3268", "#8a4270", "#c25a6a", "#ee8a62"].forEach((c, i) => P(F.x + 3, F.y + 3 + i * 3, 20, 3, c));
  ell(F.x + 16, F.y + 16, 3, 3, "#ffd690");
  for (let x = F.x + 3; x < F.x + 23; x++) {
    const h1 = 6 + Math.round(4 * Math.abs(Math.sin(x * 0.35)));
    P(x, F.y + 27 - h1, 1, h1, "#3a2050");
    const h2 = 3 + Math.round(2 * Math.abs(Math.sin(x * 0.6 + 1)));
    P(x, F.y + 27 - h2, 1, h2, "#1e1230");
  }
  A(F.x + 1, F.y + 1, 24, 1, "#ffffff", 0.3);
  const C = fx.CLOCK;
  ell(C.x, C.y, 5, 5, O);
  ell(C.x, C.y, 4, 4, "#efe4cc");
  // shelves on the right
  const sx = fx.SHELVES.x + 1;
  const shelf = (x: number, y: number, w: number) => {
    P(x - 1, y - 1, w + 2, 4, O);
    P(x, y, w, 2, "#9a643e");
    P(x, y, w, 1, "#c08a58");
    P(x, y + 2, w, 1, "#5e3624");
    X(x + 3, y + 3, O);
    X(x + w - 4, y + 3, O);
  };
  reseed(311);
  const books = (x: number, y: number, n: number) => {
    let cx = x;
    const cols = ["#c0485a", "#4a7ab0", "#e0b050", "#5a9a6a", "#8a5ab0", "#d87a4a", "#3a5a8a"];
    for (let i = 0; i < n; i++) {
      const h = 6 + Math.floor(rnd() * 4);
      const c = cols[Math.floor(rnd() * cols.length)];
      P(cx, y - h, 3, h, O);
      P(cx, y - h + 1, 2, h - 1, c);
      X(cx, y - h + 1, lt(c, 0.4));
      X(cx + 1, y - h + 3, lt(c, 0.5));
      cx += 3;
    }
    return cx;
  };
  shelf(sx, 22, 48);
  shelf(sx, 37, 48);
  let bx = books(sx + 2, 22, 6);
  P(bx + 3, 17, 5, 5, O);
  P(bx + 4, 18, 3, 4, "#efe4cc");
  P(bx + 7, 19, 1, 2, O);
  P(bx + 4, 18, 3, 1, "#5a3020");
  P(sx + 38, 15, 7, 7, O);
  P(sx + 39, 16, 5, 6, "#c0603a");
  P(sx + 39, 16, 5, 1, "#e08050");
  for (let i = 0; i < 9; i++) {
    const vy = 14 + i * 3;
    X(sx + 41 + (i % 2 ? 2 : -1), Math.min(vy, 44), "#4f8a4a");
    X(sx + 42 + (i % 2 ? 2 : -2), Math.min(vy + 1, 45), "#2f5e45");
  }
  ell(sx + 41, 13, 4, 3, O);
  ell(sx + 41, 13, 3, 2, "#4f8a4a");
  X(sx + 40, 12, "#8cc05a");
  bx = books(sx + 14, 37, 4);
  P(sx + 4, 31, 7, 6, O);
  P(sx + 5, 32, 5, 5, "#3a3a58");
  P(sx + 5, 32, 5, 1, "#5d5c80");
  X(sx + 7, 34, "#ff6aa8");
  P(bx + 4, 33, 9, 4, O);
  P(bx + 5, 34, 7, 3, "#e8d8b0");
  P(bx + 5, 34, 7, 1, "#fff2d0");
  P(sx + 8, 7, 10, 10, O);
  P(sx + 9, 8, 8, 8, "#e0c890");
  P(sx + 10, 9, 6, 6, "#4a7ab0");
  P(sx + 10, 12, 6, 3, "#5a9a6a");
  P(sx + 24, 6, 12, 9, O);
  P(sx + 25, 7, 10, 7, "#2a1c34");
  P(sx + 26, 8, 8, 5, "#ff6aa8");
  P(sx + 28, 9, 4, 3, "#1d1228");
  // string lights
  for (let x = 0; x < width; x++) {
    const y = 4 + Math.round(3 * Math.abs(Math.sin((x / 40) * Math.PI)));
    X(x, y, "#2a1c30");
    if (x % 10 === 5) {
      const c = ["#ffd27a", "#ff9a6a", "#ffe6a0", "#ff8ab8"][((x / 10) | 0) % 4];
      X(x, y + 1, c);
      X(x, y + 2, lt(c, 0.5));
    }
  }
  // the LED strip that shows tokens a minute
  const M = fx.METER;
  P(M.x - 1, M.y - 1, M.w + 2, M.h + 2, O);
  P(M.x, M.y, M.w, M.h, "#06120c");
  P(M.x, M.y, M.w, 1, "#0d2418");
  for (let k = 2; k < M.w - 1; k += 3) X(M.x + k, M.y + M.h - 1, "#0b1d14");
}

const RUGS = [
  { edge: "#1e3e4e", band: "#d0a860", base: "#25506a", pat: "#3a7290", dot: "#e8c880", dot2: "#2e6080", fringe: "#e8dcc0" },
  { edge: "#4e1e2c", band: "#d8b880", base: "#7a2e3e", pat: "#9a4450", dot: "#f0d098", dot2: "#8a3a48", fringe: "#e8dcc0" },
  { edge: "#2e3a1e", band: "#d0b070", base: "#4a5a2a", pat: "#6a7a3a", dot: "#e8d890", dot2: "#56662e", fringe: "#e8dcc0" },
];

function rug(pen: Pen, x: number, y: number, w: number, h: number, c: (typeof RUGS)[number]) {
  const { P, A, X, ell } = pen;
  P(x - 1, y - 1, w + 2, h + 2, O);
  P(x, y, w, h, c.edge);
  P(x + 2, y + 2, w - 4, h - 4, c.band);
  P(x + 4, y + 4, w - 8, h - 8, c.base);
  for (let i = x + 4; i < x + w - 4; i += 4) {
    X(i, y + 1, c.dot);
    X(i + 2, y + h - 2, c.dot);
  }
  const mx = x + w / 2;
  const my = y + h / 2;
  for (let dy = -(h / 2 - 7); dy <= h / 2 - 7; dy++) {
    const hw = Math.round((w / 2 - 10) * (1 - Math.abs(dy) / (h / 2 - 6)));
    if (hw > 0) {
      X(mx - hw, my + dy, c.pat);
      X(mx + hw - 1, my + dy, c.pat);
    }
  }
  for (let yy = y + 6; yy < y + h - 6; yy += 6) for (let xx = x + 8; xx < x + w - 8; xx += 8) X(xx, yy, c.dot2);
  ell(mx, my, 5, 3, c.pat);
  ell(mx, my, 3, 1, c.dot);
  for (let yy = y; yy < y + h; yy += 2) {
    X(x - 2, yy, c.fringe);
    X(x - 3, yy, dk(c.fringe, 0.3));
    X(x + w + 1, yy, c.fringe);
    X(x + w + 2, yy, dk(c.fringe, 0.3));
  }
  A(x, y, w, 1, "#ffffff", 0.08);
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

export function stool(pen: Pen, x: number, y: number, c: string) {
  const { P, shadow } = pen;
  shadow(x + 3, y + 9, 4, 1, 0.45);
  P(x + 2, y + 3, 2, 6, "#3a3850");
  P(x + 2, y + 3, 1, 6, "#5d5c80");
  P(x, y + 8, 6, 1, "#3a3850");
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

function podBase(pen: Pen, p: Pod, k: number, colors: (string | null)[]) {
  rug(pen, p.x - 6, p.d - 21, 82, 72, RUGS[k % RUGS.length]);
  [0, 1].forEach((s) => {
    const cx = p.x + 15 + s * 40;
    const c = colors[s];
    if (!c) return chairBack(pen, cx, p.d - 9, "#6a5a88", 8);
    pen.shadow(cx, p.d - 2, 9, 2, 0.35);
    chairBack(pen, cx, p.d - 17, dk(c, 0.55), 14);
  });
}

function podMid(pen: Pen, p: Pod, colors: (string | null)[], props: ((typeof PROPS)[number] | null)[]) {
  const { P, X, shadow, rnd, reseed, fronds } = pen;
  const ox = p.x;
  const D = p.d;
  const w = POD_W;
  const sx = [ox + 15, ox + 55];
  shadow(ox + w / 2, D + 31, w / 2 + 4, 3, 0.45);
  P(ox - 1, D - 1, w + 2, 31, O);
  P(ox, D, w, 24, "#b07a4e");
  P(ox, D, w, 1, "#d8a46c");
  reseed(ox * 7 + D);
  for (let k = 0; k < 10; k++) P(ox + 3 + Math.floor(rnd() * (w - 12)), D + 2 + Math.floor(rnd() * 20), 4 + Math.floor(rnd() * 5), 1, "#a06c44");
  P(ox, D + 11, w, 1, "#8a5a38");
  P(ox, D + 12, w, 1, "#6e4228");
  P(ox, D + 13, w, 1, "#c08a5a");
  P(ox, D + 24, w, 5, "#6a3e28");
  P(ox, D + 24, w, 1, "#d09a64");
  P(ox + w - 1, D + 1, 1, 28, "#5a3220");
  P(ox + 2, D + 29, 2, 2, O);
  P(ox + w - 4, D + 29, 2, 2, O);
  P(ox + w - 8, D + 29, 1, 4, "#241830");
  P(ox + w - 8, D + 33, 6, 1, "#241830");
  [0, 1].forEach((s) => {
    const cx = sx[s];
    P(cx - 6, D + 1, 12, 3, O);
    P(cx - 5, D + 1, 10, 2, "#3a3850");
    for (let k = 0; k < 5; k++) X(cx - 4 + k * 2, D + 1, "#8e8db0");
    P(cx - 8, D + 3, 16, 9, O);
    P(cx - 7, D + 4, 14, 7, "#34324c");
    P(cx - 7, D + 4, 14, 1, "#5d5c80");
    X(cx, D + 7, "#5d5c80");
  });
  [2, 3].forEach((s) => {
    const cx = sx[s - 2];
    if (!colors[s]) return prop(pen, "note", cx - 3, D + 15);
    P(cx - 9, D + 6, 18, 12, O);
    P(cx - 8, D + 7, 16, 10, "#2b2a40");
    P(cx - 7, D + 8, 14, 8, "#16122a");
    P(cx - 2, D + 18, 4, 2, O);
    P(cx - 4, D + 19, 8, 2, O);
    P(cx - 3, D + 19, 6, 1, "#3a3850");
  });
  props.forEach((k, s) => {
    if (!k || !colors[s]) return;
    const x = s % 2 ? ox + w - 8 : ox + 2;
    prop(pen, k, x, s < 2 ? D + 4 : D + 15);
  });
  const mx = ox + 35;
  P(mx - 6, D + 2, 12, 22, O);
  P(mx - 5, D + 3, 10, 20, "#5e3a28");
  P(mx - 5, D + 3, 10, 1, "#8a5638");
  P(mx - 4, D + 4, 8, 18, "#3a2418");
  P(mx - 1, D - 8, 2, 12, O);
  X(mx, D - 7, "#e8c060");
  P(mx, D - 6, 1, 10, "#c89a40");
  P(mx - 5, D - 12, 10, 5, O);
  P(mx - 4, D - 11, 8, 3, "#3f8a6a");
  P(mx - 4, D - 11, 8, 1, "#6ac09a");
  P(mx - 3, D - 8, 6, 1, "#fff0b0");
  reseed(ox * 13 + 7);
  fronds(mx, D + 18, 7, 9, 70);
  [2, 3].forEach((s) => {
    if (!colors[s]) emptyChair(pen, sx[s - 2], D, "#6a5a88");
  });
}

function backCounter(pen: Pen) {
  const { P, box } = pen;
  box(10, 54, 64, 14, "#8a5a3a", "#5a3424", 5);
  for (let x = 14; x < 72; x += 10) P(x, 61, 1, 6, "#3e2219");
  P(38, 46, 6, 10, O);
  P(39, 47, 4, 3, "#6a3e2c");
  P(39, 50, 4, 5, "#3a3850");
  P(39, 47, 4, 1, "#8a5638");
  for (let i = 0; i < 3; i++) {
    P(48 + i * 5, 52 - (i === 1 ? 3 : 0), 4, 4, O);
    P(49 + i * 5, 53 - (i === 1 ? 3 : 0), 2, 2, "#efe4cc");
  }
  P(62, 47, 8, 8, O);
  P(63, 48, 6, 7, "#4a7a6a");
  P(63, 48, 6, 1, "#6aa08a");
  pen.X(65, 46, O);
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

function frontCounter(pen: Pen) {
  const { P, A, X, box, shadow } = pen;
  shadow(44, 98, 36, 3, 0.4);
  box(10, 78, 68, 20, "#9a6440", "#5e3624", 6);
  P(10, 78, 68, 1, "#d09060");
  for (let x = 14; x < 76; x += 8) {
    P(x, 86, 1, 11, "#4a2a1e");
    P(x + 1, 86, 1, 11, "#6e4430");
  }
  P(10, 95, 68, 1, "#c8a050");
  P(10, 96, 68, 1, "#7a6030");
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
  P(57, 72, 12, 6, "#3a3850");
  P(58, 73, 6, 2, "#62f0ff");
  P(57, 72, 12, 1, "#5d5c80");
  X(66, 75, "#ff6aa8");
  P(46, 75, 4, 4, O);
  P(47, 76, 2, 2, "#efe4cc");
  X(47, 75, "#5a3020");
  for (const s of barSeats().slice(0, 4)) stool(pen, s.x - 3, s.y, "#b4475f");
}

function lounge(pen: Pen, fx: Fixtures) {
  const { P, X, ell, shadow } = pen;
  const L = fx.LOUNGE.x + 2 - 248;
  const x = (v: number) => v + L;
  ell(x(281), 124, 29, 19, O);
  ell(x(281), 124, 28, 18, "#c08a3a");
  ell(x(281), 124, 25, 16, "#3a5a4a");
  ell(x(281), 124, 20, 12, "#d8b060");
  ell(x(281), 124, 19, 11, "#4a7058");
  ell(x(281), 124, 12, 7, "#d8b060");
  ell(x(281), 124, 11, 6, "#5a8668");
  for (let a = 0; a < 40; a++) {
    const an = (a / 40) * Math.PI * 2;
    X(Math.round(x(281) + Math.cos(an) * 30), Math.round(124 + Math.sin(an) * 20), "#e8dcc0");
  }
  shadow(x(252), 106, 5, 2, 0.5);
  P(x(250), 104, 5, 2, O);
  P(x(251), 74, 2, 31, O);
  X(x(252), 76, "#e8c060");
  P(x(252), 77, 1, 27, "#c89a40");
  P(x(246), 68, 12, 8, O);
  P(x(247), 69, 10, 6, "#f0d8a0");
  P(x(247), 69, 10, 1, "#fff2d0");
  P(x(247), 74, 10, 1, "#c8a060");
  shadow(x(282), 108, 28, 3, 0.45);
  P(x(256), 85, 52, 24, O);
  P(x(257), 86, 50, 10, "#5a3a7a");
  P(x(257), 86, 50, 1, "#8a64b0");
  P(x(257), 87, 50, 1, "#6e4a92");
  for (let v = 263; v < 304; v += 8) {
    X(x(v), 90, "#3e2658");
    X(x(v + 4), 93, "#3e2658");
  }
  P(x(260), 95, 44, 8, "#6e4892");
  P(x(260), 95, 44, 1, "#9a76c0");
  P(x(281), 95, 1, 8, "#4a2e68");
  P(x(260), 102, 44, 1, "#4a2e68");
  P(x(257), 103, 50, 5, "#3e2658");
  P(x(257), 103, 50, 1, "#5a3a7a");
  P(x(256), 89, 5, 19, O);
  P(x(257), 90, 3, 17, "#6e4892");
  P(x(257), 90, 3, 1, "#a080c8");
  P(x(303), 89, 5, 19, O);
  P(x(304), 90, 3, 17, "#5a3a7a");
  P(x(304), 90, 3, 1, "#8a64b0");
  P(x(262), 90, 7, 6, O);
  P(x(263), 91, 5, 4, "#ff8ab8");
  P(x(263), 91, 5, 1, "#ffc0d8");
  shadow(x(282), 129, 15, 3, 0.45);
  ell(x(282), 121, 15, 5, O);
  ell(x(282), 121, 14, 4, "#8a5a38");
  ell(x(282), 120, 14, 3, "#a8704a");
  P(x(270), 124, 24, 3, "#5e3624");
  P(x(272), 127, 2, 2, O);
  P(x(290), 127, 2, 2, O);
  P(x(276), 117, 12, 6, O);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) P(x(277) + i * 2, 118 + j * 2, 2, 2, (i + j) & 1 ? "#ff8ab8" : "#f4e8d8");
  X(x(279), 117, "#1a1020");
  X(x(279), 116, "#1a1020");
  X(x(285), 117, "#ffffff");
  X(x(285), 116, "#f4e8d8");
  P(x(291), 118, 4, 4, O);
  P(x(292), 119, 2, 2, "#efe4cc");
  const bean = (cx: number, cy: number, c: string) => {
    shadow(cx, cy + 5, 8, 2, 0.45);
    ell(cx, cy, 8, 6, O);
    ell(cx, cy, 7, 5, c);
    ell(cx - 1, cy - 2, 5, 2, lt(c, 0.2));
    X(cx - 3, cy - 3, lt(c, 0.5));
    P(cx - 5, cy + 3, 10, 1, dk(c, 0.3));
  };
  bean(x(266), 140, "#3a8a8a");
  bean(x(297), 140, "#d89a3a");
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

function bigPlant(pen: Pen, cx: number, by: number) {
  const { P, shadow, reseed, fronds } = pen;
  shadow(cx, by, 8, 2, 0.5);
  reseed(cx * 17);
  fronds(cx, by - 8, 9, 15, 75);
  P(cx - 6, by - 9, 12, 9, O);
  P(cx - 5, by - 8, 10, 8, "#b0583a");
  P(cx - 5, by - 8, 10, 1, "#d8784a");
  P(cx - 4, by - 7, 8, 1, "#3a2418");
  P(cx + 2, by - 6, 2, 5, "#8a4028");
}

function bistro(pen: Pen, cx: number, cy: number) {
  const { P, X, ell, shadow } = pen;
  shadow(cx, cy + 9, 9, 2, 0.45);
  P(cx - 1, cy + 3, 2, 6, "#3a3850");
  P(cx - 4, cy + 8, 8, 1, "#3a3850");
  ell(cx, cy, 8, 3, O);
  ell(cx, cy, 7, 2, "#d8d0e0");
  P(cx - 7, cy, 14, 1, "#a8a0b8");
  P(cx - 2, cy - 3, 4, 3, O);
  X(cx - 1, cy - 2, "#efe4cc");
  X(cx, cy - 2, "#5a3020");
  stool(pen, cx - 16, cy, "#3f8a6a");
  stool(pen, cx + 10, cy, "#3f8a6a");
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
 * Everything that never moves, rendered once per layout and theme: the walls, the window with the outside at this
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

  // floor
  reseed(4242);
  for (let y = FL; y < FB; y += 6) {
    let x = 9 - ((y * 13) % 41);
    while (x < W - 9) {
      const len = 30 + Math.floor(rnd() * 34);
      const c = pal.floor[Math.floor(rnd() * pal.floor.length)];
      P(x, y, len, 6, c);
      P(x, y, len, 1, lt(c, 0.12));
      P(x, y + 5, len, 1, dk(c, 0.45));
      P(x, y + 1, 1, 4, dk(c, 0.38));
      for (let k = 0; k < 2; k++) {
        const gx = x + 3 + Math.floor(rnd() * Math.max(1, len - 12));
        P(gx, y + 2 + Math.floor(rnd() * 2), 6 + Math.floor(rnd() * 8), 1, dk(c, 0.1));
      }
      if (rnd() < 0.25) X(x + 4 + Math.floor(rnd() * (len - 8)), y + 3, dk(c, 0.4));
      x += len;
    }
  }
  // back wall, chair rail and wainscoting
  P(0, 0, W, FL, pal.wall);
  for (let x = 0; x < W; x += 8) P(x, 4, 4, 38, pal.stripe);
  for (let y = 8; y < 40; y += 8)
    for (let x = 2 + ((y / 8) % 2) * 4; x < W; x += 8) {
      X(x, y, pal.dot);
      X(x - 1, y + 1, pal.dot2);
      X(x + 1, y + 1, pal.dot2);
      X(x, y + 2, pal.dot);
    }
  P(0, 0, W, 3, pal.ceil);
  P(0, 3, W, 1, pal.ceil2);
  A(0, 4, W, 4, "#120a1a", 0.35);
  P(0, 41, W, 1, O);
  P(0, 42, W, 2, pal.rail);
  P(0, 42, W, 1, pal.railHi);
  P(0, 44, W, 1, pal.railDark);
  P(0, 45, W, 17, pal.wains);
  for (let x = 1; x < W; x += 20) {
    P(x + 2, 47, 16, 12, pal.panel);
    P(x + 2, 47, 16, 1, pal.panelDark);
    P(x + 2, 47, 1, 12, pal.panelDark);
    P(x + 2, 58, 16, 1, pal.panelLight);
    P(x + 17, 47, 1, 12, pal.panelLight);
    P(x + 4, 49, 12, 8, pal.panelIn);
  }
  P(0, 62, W, 4, pal.skirt);
  P(0, 62, W, 1, pal.skirtHi);
  P(0, 65, W, 1, O);
  A(0, 66, W, 2, "#12061a", 0.45);
  A(0, 68, W, 2, "#12061a", 0.22);

  const win = fx.WINDOWS[0];
  const [wc, wa] = windowLight(th);
  glow(win.x + win.w / 2, 26, 40, 24, wc, wa * 0.5);
  drawWindow(g, pen, fx, th, pal);
  drawSign(g, pen, fx, brand);
  drawWallDecor(pen, fx, W);

  // side walls, then the rugs
  const sideWall = (x: number, flip: boolean) => {
    const [a, b, c, d, e] = pal.side;
    for (let y = 0; y < H; y++)
      for (let i = 0; i < 9; i++) X(flip ? x + 8 - i : x + i, y, i < 4 ? (i === 0 ? a : i === 3 ? O : b) : i === 4 ? c : d);
    for (let y = 6; y < H; y += 12) P(flip ? x + 5 : x + 1, y, 3, 1, e);
    P(flip ? x : x + 4, FL - 4, 5, 4, pal.skirt);
  };
  sideWall(0, false);
  sideWall(W - 9, true);
  A(9, FL, 3, FB - FL, "#12061a", 0.35);
  A(W - 12, FL, 3, FB - FL, "#12061a", 0.35);

  const colors = (p: number) => [0, 1, 2, 3].map((s) => agents[p * 4 + s]?.color ?? null);
  lay.pods.forEach((p, k) => podBase(pen, p, k, colors(k)));
  lounge(pen, fx);

  // the window's light on the floor
  g.globalCompositeOperation = "lighter";
  g.fillStyle = wc;
  for (let y = FL; y < FL + 64; y++) {
    const t = (y - FL) / 64;
    const l = win.x + t * 36;
    const r = win.x + win.w + t * 46;
    for (let x = Math.round(l); x < Math.round(r); x++) {
      const u = (x - l) / (r - l);
      if (Math.abs(u - 0.5) < 0.035) continue;
      if (t > 0.6 && (x + y) & 1) continue;
      if (t > 0.85 && (x + 2 * y) % 4) continue;
      g.globalAlpha = wa * (1 - t * 0.55);
      g.fillRect(x, y, 1, 1);
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";

  backCounter(pen);
  bigPlant(pen, 20, FB);
  bigPlant(pen, W - 20, FB);
  bistro(pen, fx.BISTRO.x, fx.BISTRO.y);
  const door = doorOf(lay);
  P(door.x + 3, FB - 7, 32, 7, O);
  P(door.x + 4, FB - 6, 30, 6, "#6a4a2a");
  for (let x = door.x + 5; x < door.x + 33; x += 2) X(x, FB - 4, "#8a6a3a");
  P(0, FB, W, H - FB, O);
  P(0, FB + 1, door.x, 5, pal.cap);
  P(0, FB + 1, door.x, 1, pal.capHi);
  P(door.x + 38, FB + 1, W - door.x - 38, 5, pal.cap);
  P(door.x + 38, FB + 1, W - door.x - 38, 1, pal.capHi);
  P(door.x, FB, 1, 8, O);
  P(door.x + 37, FB, 1, 8, O);
  P(door.x + 1, FB, 36, 8, "#5e3a28");
  P(door.x + 1, FB, 36, 1, "#8a5638");
  for (let x = 0; x < W; x += 12) if (x < door.x - 6 || x > door.x + 42) P(x + 2, FB + 3, 4, 1, pal.side[4]);

  // what stands in front of the far row
  const [mid, gm] = canvas(W, H);
  const mp = hallPen(gm);
  frontCounter(mp);
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
  mul(0, FL, W, FB - FL, "#d6c4dc");
  mul(0, FB - 34, W, 34, "#dccce0");
  mul(0, FB - 16, W, 16, "#dccce0");
  mul(0, 0, 40, H, "#e0d0e4");
  mul(W - 40, 0, 40, H, "#e0d0e4");

  const lampC = th.lampGlow;
  const [lamps, gl] = canvas(W, H);
  const lp = hallPen(gl);
  lay.pods.forEach((p) => {
    const mx = p.x + 35;
    lp.glow(mx, p.d + 4, 34, 15, lampC, 0.16);
    lp.glow(mx, p.d - 9, 6, 3, "#fff0b0", 0.4);
  });
  const L = fx.LOUNGE.x + 2;
  lp.glow(L + 4, 78, 16, 10, "#ffc070", 0.25);
  lp.glow(L + 10, 106, 30, 14, lampC, 0.13);
  lp.glow(44, 76, 40, 14, lampC, 0.12);
  for (const x of [28, 58]) lp.glow(x, 38, 10, 7, "#ffc070", 0.22);

  const [neon, gn] = canvas(W, H);
  const np = hallPen(gn);
  const S = fx.SIGN;
  np.glow(S.x + S.w / 2, S.y + S.h / 2 + 2, 48, 18, "#ff6aa8", 0.13);
  const a = fx.ARCADE;
  np.glow(a.x + 9, a.y + 8, 16, 12, "#ff6aa8", 0.14);
  np.glow(a.x + 9, a.y + 32, 16, 4, "#ff6aa8", 0.12);

  const [post, gp] = canvas(W, H);
  const pp = hallPen(gp);
  for (const x of [28, 58]) {
    pp.P(x, 0, 1, 30, "#241830");
    pp.P(x - 3, 30, 7, 4, O);
    pp.P(x - 2, 30, 5, 3, "#c89a40");
    pp.P(x - 2, 30, 5, 1, "#f0d080");
    pp.X(x, 34, "#fff6d0");
  }
  return { base, mid, dim, lamps, neon, post, brand };
}
