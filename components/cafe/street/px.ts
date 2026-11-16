import { Ctx } from "../pixel";

/** The street's darkest ink, for outlines. */
export const INK = "#0d0a14";
/** What each state looks like, on the monitors, the faces and the tags. */
export const STATE = { work: "#62f0ff", ask: "#ffc456", done: "#8ee59b", idle: "#9184b0" } as const;
export type StreetState = keyof typeof STATE;

const B4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
/** The 4×4 ordered-dither threshold at a pixel, 0..1. */
export const bay = (x: number, y: number) => B4[y & 3][x & 3] / 16;

/** A seeded 0..1 stream, so the same street is painted every time. */
export function stream(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const rgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (r: number, g: number, b: number) =>
  "#" + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);

/** Between two hex colours, `t` of the way. */
export function mix(a: string, b: string, t: number): string {
  const p = rgb(a);
  const q = rgb(b);
  return hex(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
}

/** Pixel painting on one context: plain boxes, see-through boxes, lines, rings and dithered light. */
export function pen(g: Ctx) {
  const P = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const A = (x: number, y: number, w: number, h: number, c: string, a: number) => {
    g.globalAlpha = a;
    P(x, y, w, h, c);
    g.globalAlpha = 1;
  };
  const line = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    g.fillStyle = c;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let k = 0; k < 400; k++) {
      g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y0 += sy;
      }
    }
  };
  const ring = (cx: number, cy: number, r: number, c: string) => {
    g.fillStyle = c;
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      g.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 1, 1);
    }
  };
  /** Light that falls off in dithered steps, as in the design: no smooth gradients. */
  const glow = (cx: number, cy: number, rx: number, ry: number, col: string, amax: number, lv = 4) => {
    if (amax <= 0.002) return;
    g.drawImage(glowSprite(rx, ry, col, amax, lv), Math.round(cx - rx), Math.round(cy - ry));
  };
  /** A small sprite from strings, one character a pixel, `.` for nothing, with an optional outline around it. */
  const spr = (rows: string[], map: Record<string, string>, x: number, y: number, outline?: string | null) => {
    const h = rows.length;
    const w = rows[0].length;
    const at = (i: number, j: number) => (j < 0 || j >= h || i < 0 || i >= w ? "." : rows[j][i]);
    if (outline) {
      g.fillStyle = outline;
      for (let j = -1; j <= h; j++)
        for (let i = -1; i <= w; i++)
          if (at(i, j) === "." && (at(i - 1, j) !== "." || at(i + 1, j) !== "." || at(i, j - 1) !== "." || at(i, j + 1) !== "."))
            g.fillRect(x + i, y + j, 1, 1);
    }
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const c = at(i, j);
        if (c !== "." && map[c]) {
          g.fillStyle = map[c];
          g.fillRect(x + i, y + j, 1, 1);
        }
      }
  };
  return { P, A, line, ring, glow, spr };
}

const glows = new Map<string, HTMLCanvasElement>();

/** A dithered pool of light, painted once and kept: it is drawn many times a frame. */
export function glowSprite(rx: number, ry: number, col: string, amax: number, lv: number): HTMLCanvasElement {
  const RX = Math.max(1, Math.round(rx));
  const RY = Math.max(1, Math.round(ry));
  const key = `${RX}|${RY}|${col}|${amax.toFixed(3)}|${lv}`;
  const hit = glows.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = RX * 2 + 1;
  c.height = RY * 2 + 1;
  const g = c.getContext("2d")!;
  g.fillStyle = col;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const dx = (x - RX) / RX;
      const dy = (y - RY) / RY;
      const d = 1 - Math.sqrt(dx * dx + dy * dy);
      if (d <= 0) continue;
      const q = Math.min(lv, Math.floor(d * lv + bay(x, y)));
      if (q <= 0) continue;
      g.globalAlpha = (amax * q) / lv;
      g.fillRect(x, y, 1, 1);
    }
  if (glows.size > 400) glows.clear();
  glows.set(key, c);
  return c;
}

/** A clipped stretch of painting. */
export function clipped(g: Ctx, x: number, y: number, w: number, h: number, fn: () => void) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  fn();
  g.restore();
}

/** Brick courses with mortar, each brick a touch lighter or darker. */
export function bricks(g: Ctx, r: () => number, x0: number, y0: number, w: number, h: number, base: string, mort: string, v: number) {
  const { P } = pen(g);
  P(x0, y0, w, h, mort);
  for (let y = y0, row = 0; y < y0 + h; y += 3, row++) {
    for (let x = x0 - (row % 2 ? 4 : 0); x < x0 + w; x += 8) {
      const c = mix(base, r() < 0.5 ? "#000000" : "#ffffff", r() * v);
      const xa = Math.max(x, x0);
      const xb = Math.min(x + 7, x0 + w);
      if (xb <= xa) continue;
      P(xa, y, xb - xa, Math.min(2, y0 + h - y), c);
      if (r() < 0.25) P(xa + Math.floor(r() * (xb - xa)), y, 1, 1, mix(c, "#000000", 0.25));
      P(xa, y, xb - xa, 1, mix(c, "#ffffff", 0.05));
    }
  }
}

/** The design's 5×7 capitals for the neon. */
export const NEON_FONT: Record<string, string[]> = {
  A: [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
  G: [".XXX.", "X...X", "X....", "X.XXX", "X...X", "X...X", ".XXX."],
  E: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
  N: ["X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X", "X...X"],
  T: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.."],
  L: ["X....", "X....", "X....", "X....", "X....", "X....", "XXXXX"],
  O: [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  U: ["X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
};
