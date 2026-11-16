import { Ctx } from "./pixel";
import { mix } from "./street/px";

/** The hall's darkest ink, for outlines. */
export const O = "#1a1020";
export const lt = (c: string, t: number) => mix(c, "#fff2c4", t);
export const dk = (c: string, t: number) => mix(c, "#24103a", t);

/** The design's 3×5 pixel capitals, enough for «AGENT LOUNGE» and «МЕНЮ». */
const FONT: Record<string, string[]> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  G: [".##", "#..", "#.#", "#.#", ".##"],
  E: ["###", "#..", "##.", "#..", "###"],
  N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  L: ["#..", "#..", "#..", "#..", "###"],
  O: [".#.", "#.#", "#.#", "#.#", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", ".##"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  Y: ["#..#.", "#.#.#", "###.#", "#.#.#", "#..#."],
  " ": ["..", "..", "..", "..", ".."],
};

export type Pen = ReturnType<typeof hallPen>;

/** Pixel painting the way the design does it: boxes, see-through boxes, ellipses, stepped light, sprites, a font. */
export function hallPen(g: Ctx, seed0 = 4242) {
  let seed = seed0;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const reseed = (s: number) => {
    seed = Math.max(1, Math.round(s) % 2147483646);
  };
  const P = (x: number, y: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const A = (x: number, y: number, w: number, h: number, c: string, a: number) => {
    g.globalAlpha = a;
    P(x, y, w, h, c);
    g.globalAlpha = 1;
  };
  const X = (x: number, y: number, c: string) => P(x, y, 1, 1, c);
  const ell = (cx: number, cy: number, rx: number, ry: number, c: string, a = 1) => {
    g.globalAlpha = a;
    g.fillStyle = c;
    for (let dy = -ry; dy <= ry; dy++) {
      const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
      if (hw > 0) g.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2, 1);
    }
    g.globalAlpha = 1;
  };
  /** Light in five stepped rings, added on top, as the design lights its room. */
  const glow = (cx: number, cy: number, rx: number, ry: number, c: string, a: number) => {
    const op = g.globalCompositeOperation;
    g.globalCompositeOperation = "lighter";
    [1, 0.8, 0.6, 0.4, 0.22].forEach((k, i) =>
      ell(cx, cy, Math.max(1, Math.round(rx * k)), Math.max(1, Math.round(ry * k)), c, a * (i === 0 ? 0.35 : 0.3)),
    );
    g.globalCompositeOperation = op;
  };
  const shadow = (cx: number, cy: number, rx: number, ry: number, a = 0.42) => ell(cx, cy, rx, ry, "#12061a", a);
  /** A block seen from above and in front: its top `depth` rows lit, the face below, an outline round it. */
  const box = (x: number, y: number, w: number, h: number, top: string, face: string, depth: number) => {
    P(x - 1, y - 1, w + 2, h + 2, O);
    P(x, y, w, depth, top);
    P(x, y, w, 1, lt(top, 0.25));
    P(x, y + depth, w, h - depth, face);
    P(x, y + depth, w, 1, lt(face, 0.18));
    P(x + w - 1, y + 1, 1, h - 1, dk(face, 0.25));
  };
  const spr = (rows: string[], map: Record<string, string>, x: number, y: number) => {
    rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        const c = map[r[i]];
        if (r[i] !== "." && c) X(x + i, y + j, c);
      }
    });
  };
  const textW = (s: string) => [...s].reduce((w, ch) => w + (FONT[ch] ? FONT[ch][0].length : 2) + 1, 0) - 1;
  const text = (s: string, x: number, y: number, c: string) => {
    let cx = x;
    for (const ch of s) {
      const gl = FONT[ch];
      if (!gl) {
        cx += 3;
        continue;
      }
      gl.forEach((r, j) => {
        for (let i = 0; i < r.length; i++) if (r[i] === "#") X(cx + i, y + j, c);
      });
      cx += gl[0].length + 1;
    }
  };
  /** A palm's fronds fanning up from (cx, by). */
  const fronds = (cx: number, by: number, n: number, len: number, spreadDeg: number) => {
    const fs: { a: number; L: number; c: string }[] = [];
    for (let i = 0; i < n; i++) {
      const a = ((-spreadDeg + (2 * spreadDeg * i) / (n - 1)) * Math.PI) / 180 + (rnd() - 0.5) * 0.2;
      fs.push({ a, L: len * (0.7 + rnd() * 0.3) * (1 - Math.abs(a) * 0.15), c: i % 2 ? "#3f7448" : "#4f8a4a" });
    }
    fs.sort((p, q) => Math.abs(q.a) - Math.abs(p.a));
    const pt = (f: { a: number; L: number }, t: number) => [
      Math.round(cx + Math.sin(f.a) * t * 1.15 + (Math.sin(f.a) * (t * t)) / (f.L * 2.2)),
      Math.round(by - Math.cos(f.a) * t + (Math.abs(Math.sin(f.a)) * (t * t)) / (f.L * 1.4)),
    ];
    fs.forEach((f) => {
      for (let t = 0; t <= f.L; t += 0.5) {
        const [x, y] = pt(f, t);
        const w = t < f.L * 0.8 ? 1 : 0;
        P(x - 1 - w, y - 1, 3 + 2 * w, 3, O);
      }
    });
    fs.forEach((f) => {
      for (let t = 0; t <= f.L; t += 0.5) {
        const [x, y] = pt(f, t);
        const w = t > f.L * 0.15 && t < f.L * 0.8 ? 1 : 0;
        P(x - w, y, 1 + 2 * w, 1, f.c);
        X(x, y - 1, t > f.L * 0.3 ? lt(f.c, 0.35) : f.c);
      }
      const [ex, ey] = pt(f, f.L * 0.5);
      X(ex, ey, dk(f.c, 0.35));
    });
  };
  return { P, A, X, ell, glow, shadow, box, spr, text, textW, fronds, rnd, reseed };
}

const glows = new Map<string, HTMLCanvasElement>();

/** The design's stepped light as a sprite, painted once: a status light is drawn many times a second. */
export function ringGlow(rx: number, ry: number, c: string, a: number): HTMLCanvasElement {
  const key = `${rx}|${ry}|${c}|${a.toFixed(3)}`;
  const hit = glows.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = rx * 2 + 2;
  cv.height = ry * 2 + 2;
  const g = cv.getContext("2d")!;
  hallPen(g).glow(rx + 1, ry + 1, rx, ry, c, a);
  if (glows.size > 300) glows.clear();
  glows.set(key, cv);
  return cv;
}

/** Adds a stepped pool of light centred on (cx, cy). */
export function addGlow(g: Ctx, cx: number, cy: number, rx: number, ry: number, c: string, a: number) {
  if (a <= 0.002) return;
  const op = g.globalCompositeOperation;
  g.globalCompositeOperation = "lighter";
  g.drawImage(ringGlow(Math.round(rx), Math.round(ry), c, a), Math.round(cx - rx - 1), Math.round(cy - ry - 1));
  g.globalCompositeOperation = op;
}
