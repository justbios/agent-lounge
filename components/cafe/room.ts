import { CafeLayout, WALL_H, rng } from "@/lib/cafe/layout";
import { AgentDef } from "@/lib/types";
import { Ctx, LINE, px, rand, shade } from "./pixel";

export interface Fixtures {
  WINDOWS: { x: number; w: number }[];
  SIGN: { x: number; y: number; w: number; h: number };
  CLOCK: { x: number; y: number };
  SCONCES: number[];
  VENDING: { x: number; y: number; w: number; h: number };
}

const memo = new Map<number, Fixtures>();

/** Wall fixtures for a room of the given width: the sign stays centred, the vending machine and clock hug the right wall. */
export function fixtures(width: number): Fixtures {
  const hit = memo.get(width);
  if (hit) return hit;
  const sign = { x: Math.round(width / 2 - 54), y: 6, w: 108, h: 26 };
  const windows = [
    { x: 54, w: 70 },
    { x: width - 108, w: 70 },
  ];
  if (width >= 512) windows.splice(1, 0, { x: Math.round((54 + 70 + sign.x) / 2 - 25), w: 50 }, { x: Math.round((sign.x + sign.w + width - 108) / 2 - 25), w: 50 });
  const fx: Fixtures = {
    WINDOWS: windows,
    SIGN: sign,
    CLOCK: { x: width - 18, y: 19 },
    SCONCES: [sign.x - 11, sign.x + sign.w + 11],
    VENDING: { x: width - 32, y: 38, w: 28, h: 54 },
  };
  memo.set(width, fx);
  return fx;
}

function drawFloor(ctx: Ctx, lay: CafeLayout) {
  const planks = ["#3b2c2a", "#382927", "#3f2f2c", "#352725"];
  for (let y = WALL_H, k = 0; y < lay.height; y += 5, k++) {
    px(ctx, 0, y, lay.width, 5, planks[k % planks.length]);
    px(ctx, 0, y + 4, lay.width, 1, "#2e211f");
    let x = Math.floor(rand(k * 7.3) * 40);
    while (x < lay.width) {
      px(ctx, x, y, 1, 4, "#2a1e1c");
      x += 30 + Math.floor(rand(k * 13 + x) * 26);
    }
  }
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, WALL_H, lay.width, 2);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, WALL_H + 2, lay.width, 3);
}

function drawRug(ctx: Ctx, left: number, right: number, y: number, h: number, k: number) {
  const w = right - left;
  const tones = [
    ["#1c2a33", "#2c4452", "#24364a"],
    ["#2e1f33", "#4a3052", "#3a2744"],
    ["#2a2a1c", "#4a462c", "#3a3824"],
  ][k % 3];
  px(ctx, left, y, w, h, tones[0]);
  px(ctx, left + 2, y + 2, w - 4, 1, tones[1]);
  px(ctx, left + 2, y + h - 3, w - 4, 1, tones[1]);
  px(ctx, left + 2, y + 2, 1, h - 4, tones[1]);
  px(ctx, right - 3, y + 2, 1, h - 4, tones[1]);
  for (let r = 0, yy = y + 6; yy < y + h - 4; yy += 6, r++) {
    for (let xx = left + 6 + (r % 2) * 3; xx < right - 4; xx += 6) px(ctx, xx, yy, 1, 1, tones[2]);
  }
}

function drawRugs(ctx: Ctx, lay: CafeLayout) {
  lay.bands.forEach((top, b) => {
    const xs = lay.desks.filter((d) => d.row === b).map((d) => d.x);
    if (!xs.length) return;
    drawRug(ctx, Math.max(2, Math.min(...xs) - 30), Math.min(lay.width - 2, Math.max(...xs) + 30), top - 8, 60, b);
  });
}

function drawWindow(ctx: Ctx, x: number, w: number, seed: number) {
  px(ctx, x - 1, 4, w + 2, 31, LINE);
  px(ctx, x, 5, w, 29, "#5a4766");
  const ix = x + 2;
  const iy = 7;
  const iw = w - 4;
  const ih = 25;
  const sky = ["#0b1033", "#0f1543", "#141a52", "#1a2060", "#20266b"];
  sky.forEach((c, k) => px(ctx, ix, iy + k * 5, iw, 5, c));
  for (let k = 0; k < 6; k++) px(ctx, ix + Math.floor(rand(seed * 50 + k) * iw), iy + Math.floor(rand(seed * 70 + k) * 10), 1, 1, "#c9d3ff");
  if (seed === 0) {
    px(ctx, ix + 7, iy + 3, 4, 4, "#f4ecc8");
    px(ctx, ix + 8, iy + 4, 1, 1, "#d8cfa4");
  }
  for (let bx = ix, b = 0; bx < ix + iw; b++) {
    const bw = Math.min(5 + Math.floor(rand(seed * 31 + b) * 7), ix + iw - bx);
    const bh = 7 + Math.floor(rand(seed * 17 + b * 3) * 12);
    px(ctx, bx, iy + ih - bh, bw, bh, b % 2 ? "#0a0c20" : "#0d1029");
    for (let wy = iy + ih - bh + 2; wy < iy + ih - 1; wy += 3) {
      for (let wx = bx + 1; wx < bx + bw - 1; wx += 2) {
        if (rand(wx * 3.1 + wy * 7.7 + seed) > 0.62) px(ctx, wx, wy, 1, 1, rand(wx + wy) > 0.8 ? "#7fd4ff" : "#ffd27a");
      }
    }
    bx += bw;
  }
  px(ctx, x + w / 2 - 1, iy, 2, ih, "#5a4766");
  px(ctx, ix, iy + 12, iw, 1, "#5a4766");
  px(ctx, x - 2, 33, w + 4, 2, "#7a6386");
  px(ctx, x - 2, 35, w + 4, 1, "#20182a");
}

function drawSignBoard(ctx: Ctx, fx: Fixtures) {
  const { x, y, w, h } = fx.SIGN;
  px(ctx, x - 1, y - 1, w + 2, h + 2, LINE);
  px(ctx, x, y, w, h, "#150f22");
  px(ctx, x, y, w, 1, "#2a2140");
  for (const [sx, sy] of [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4]]) {
    px(ctx, sx, sy, 1, 1, "#4b3a52");
  }
}

function drawChalkboard(ctx: Ctx) {
  px(ctx, 2, 5, 44, 30, LINE);
  px(ctx, 3, 6, 42, 28, "#6b4a35");
  px(ctx, 5, 8, 38, 24, "#1e2a24");
  for (const [lx, ly, lw] of [[8, 11, 16], [8, 15, 24], [8, 19, 20], [8, 23, 26], [8, 27, 14]]) {
    for (let i = 0; i < lw; i++) if (rand(lx * 9 + ly * 13 + i) > 0.18) px(ctx, lx + i, ly, 1, 1, "#aebdb3");
    px(ctx, 37, ly, 3, 1, "#e8c46a");
  }
}

function drawSconce(ctx: Ctx, x: number) {
  px(ctx, x - 1, 17, 2, 3, "#3a2f45");
  px(ctx, x - 4, 10, 8, 7, LINE);
  px(ctx, x - 3, 11, 6, 5, "#f0c27a");
  px(ctx, x - 3, 15, 6, 1, "#c8914e");
  px(ctx, x - 2, 11, 1, 3, "#ffe2a8");
}

function drawClockFace(ctx: Ctx, fx: Fixtures) {
  const CLOCK = fx.CLOCK;
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 7.5) continue;
      px(ctx, CLOCK.x + dx, CLOCK.y + dy, 1, 1, d > 6.5 ? LINE : d > 5.5 ? "#3a2f45" : "#e9e2cf");
    }
  }
  for (const [dx, dy] of [[0, -5], [5, 0], [0, 5], [-5, 0]]) px(ctx, CLOCK.x + dx, CLOCK.y + dy, 1, 1, "#7a6a80");
}

function drawWall(ctx: Ctx, width: number) {
  const fx = fixtures(width);
  px(ctx, 0, 0, width, WALL_H, "#2b2140");
  for (let x = 3; x < width; x += 8) px(ctx, x, 0, 1, 37, "#30254a");
  px(ctx, 0, 37, width, 2, "#4b3a52");
  px(ctx, 0, 39, width, 9, "#3a2a36");
  for (let x = 8; x < width; x += 16) {
    px(ctx, x, 40, 1, 7, "#2e212b");
    px(ctx, x + 1, 40, 1, 7, "#45333f");
  }
  px(ctx, 0, 48, width, 2, "#1c1520");
  fx.WINDOWS.forEach((w, i) => drawWindow(ctx, w.x, w.w, i));
  drawSignBoard(ctx, fx);
  drawChalkboard(ctx);
  fx.SCONCES.forEach((x) => drawSconce(ctx, x));
  drawClockFace(ctx, fx);
}

function drawStools(ctx: Ctx) {
  for (const x of [9, 23, 37]) {
    px(ctx, x - 1, 91, 2, 6, "#2a2630");
    px(ctx, x - 3, 97, 6, 1, "#2a2630");
    px(ctx, x - 5, 87, 10, 4, LINE);
    px(ctx, x - 4, 88, 8, 2, "#7a2d3a");
    px(ctx, x - 4, 88, 8, 1, "#a04254");
  }
}

function drawVending(ctx: Ctx, fx: Fixtures) {
  const { x, y, w, h } = fx.VENDING;
  px(ctx, x - 1, y - 1, w + 2, h + 2, LINE);
  px(ctx, x, y, w, h, "#233150");
  px(ctx, x, y, w, 4, "#ff4fa3");
  px(ctx, x + 3, y + 1, 9, 2, "#ffd1e8");
  px(ctx, x + 3, y + 6, 17, 32, "#0e1a2e");
  const cans = ["#ff5d73", "#ffd166", "#06d6a0", "#4cc9f0", "#f72585", "#b5e48c"];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      px(ctx, x + 4 + c * 4, y + 8 + r * 6, 3, 4, cans[(r * 5 + c) % cans.length]);
      px(ctx, x + 4 + c * 4, y + 8 + r * 6, 1, 4, "rgba(255,255,255,0.25)");
    }
    px(ctx, x + 3, y + 12 + r * 6, 17, 1, "#1c2a44");
  }
  px(ctx, x + 21, y + 8, 5, 22, "#1a2440");
  for (let k = 0; k < 5; k++) px(ctx, x + 22, y + 10 + k * 4, 3, 2, "#3b4a70");
  px(ctx, x + 23, y + 31, 1, 3, "#0b0f1a");
  px(ctx, x + 4, y + 42, 18, 6, "#0a0f1a");
  px(ctx, x, y + h - 2, w, 2, "#1a2440");
}

function drawPlant(ctx: Ctx, x: number, baseY: number) {
  const leaves = [[0, -22, 3, 6], [-5, -19, 4, 5], [4, -19, 4, 5], [-7, -14, 4, 4], [5, -14, 4, 4], [-2, -17, 4, 7], [-4, -11, 3, 3], [3, -11, 3, 3]];
  for (const [dx, dy, w, h] of leaves) px(ctx, x + dx - 1, baseY + dy - 1, w + 2, h + 2, LINE);
  leaves.forEach(([dx, dy, w, h], i) => px(ctx, x + dx, baseY + dy, w, h, i % 2 ? "#2f7a4b" : "#3e9a5d"));
  px(ctx, x - 6, baseY - 9, 12, 10, LINE);
  px(ctx, x - 5, baseY - 8, 10, 8, "#8a4b2f");
  px(ctx, x - 5, baseY - 8, 10, 2, "#a65d3b");
}

function drawDesk(ctx: Ctx, X: number, T: number, color: string) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(X - 21, T + 25, 42, 4);
  px(ctx, X - 19, T + 21, 2, 6, "#2d211b");
  px(ctx, X + 17, T + 21, 2, 6, "#2d211b");
  px(ctx, X - 21, T + 12, 42, 13, LINE);
  px(ctx, X - 20, T + 13, 40, 8, "#7a5a44");
  px(ctx, X - 20, T + 13, 40, 1, "#94704f");
  px(ctx, X - 20, T + 21, 40, 3, "#573d2e");

  px(ctx, X - 11, T - 1, 22, 15, LINE);
  px(ctx, X - 10, T, 20, 13, "#1c1a26");
  px(ctx, X - 10, T, 20, 1, "#2e2b3c");
  px(ctx, X - 8, T + 2, 16, 9, "#05060c");
  px(ctx, X - 1, T + 13, 2, 2, "#1c1a26");
  px(ctx, X - 4, T + 15, 8, 1, "#2a2736");

  px(ctx, X + 12, T + 2, 7, 13, LINE);
  px(ctx, X + 13, T + 3, 5, 11, "#191723");
  px(ctx, X + 13, T + 3, 5, 1, "#2a2736");
  for (let k = 0; k < 3; k++) px(ctx, X + 14, T + 8 + k * 2, 3, 1, "#24212f");

  px(ctx, X - 7, T + 17, 14, 3, "#23212e");
  for (let k = 0; k < 6; k++) px(ctx, X - 6 + k * 2, T + 18, 1, 1, "#4f4a68");
  px(ctx, X - 7, T + 20, 14, 1, shade(color, 0.7));
  px(ctx, X + 9, T + 16, 7, 4, "#191723");
  px(ctx, X + 11, T + 17, 2, 2, "#d7d3e4");

  px(ctx, X - 18, T + 14, 6, 6, LINE);
  px(ctx, X - 17, T + 15, 4, 4, "#ece4d6");
  px(ctx, X - 16, T + 15, 2, 1, "#6b4325");
  px(ctx, X - 13, T + 16, 1, 2, "#ece4d6");
}

type Prop = "cactus" | "duck" | "cans" | "books" | "lamp" | "none";
const PROPS: Prop[] = ["cactus", "duck", "cans", "books", "lamp", "none"];

function drawProp(ctx: Ctx, X: number, T: number, prop: Prop, r: () => number) {
  const L = X - 20;
  const base = T + 13;
  switch (prop) {
    case "cactus":
      px(ctx, L, base - 9, 6, 10, LINE);
      px(ctx, L + 1, base - 3, 4, 3, "#a65d3b");
      px(ctx, L + 2, base - 8, 2, 5, "#3e9a5d");
      px(ctx, L + 1, base - 6, 1, 2, "#3e9a5d");
      px(ctx, L + 4, base - 7, 1, 2, "#3e9a5d");
      px(ctx, L + 2, base - 9, 1, 1, "#ff7eb6");
      return;
    case "duck":
      px(ctx, L, base - 6, 7, 6, LINE);
      px(ctx, L + 1, base - 3, 5, 3, "#ffd23f");
      px(ctx, L + 3, base - 5, 3, 3, "#ffd23f");
      px(ctx, L + 6, base - 4, 1, 1, "#ff8c1a");
      px(ctx, L + 4, base - 5, 1, 1, LINE);
      return;
    case "cans":
      for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
        const c = ["#4cc9f0", "#06d6a0", "#ff5d73", "#ffd166"][Math.floor(r() * 4)];
        px(ctx, L + k * 3, base - 5, 3, 5, LINE);
        px(ctx, L + k * 3 + 1, base - 4, 1, 4, c);
      }
      return;
    case "books": {
      const cols = ["#b4475f", "#3f6fb0", "#4f9a62", "#c9a44a"];
      for (let k = 0; k < 3; k++) {
        px(ctx, L + (k % 2), base - 3 - k * 2, 8, 3, LINE);
        px(ctx, L + 1 + (k % 2), base - 2 - k * 2, 6, 1, cols[(k + Math.floor(r() * 4)) % 4]);
      }
      return;
    }
    case "lamp":
      px(ctx, L + 1, base - 11, 7, 12, LINE);
      px(ctx, L + 2, base - 10, 5, 3, "#ffcf6e");
      px(ctx, L + 4, base - 7, 1, 6, "#4a4458");
      px(ctx, L + 2, base - 1, 5, 1, "#4a4458");
      return;
    default:
      return;
  }
}

function drawSticky(ctx: Ctx, X: number, T: number, r: () => number) {
  if (r() < 0.45) return;
  const c = ["#ffe066", "#ff9ecf", "#9be7ff"][Math.floor(r() * 3)];
  px(ctx, X + 6 - Math.floor(r() * 3), T - 2, 3, 3, c);
}

/** Everything that never moves, rendered once per layout. */
export function buildRoom(lay: CafeLayout, agents: AgentDef[], seed = 1): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = lay.width;
  c.height = lay.height;
  const ctx = c.getContext("2d")!;
  drawFloor(ctx, lay);
  drawRugs(ctx, lay);
  drawWall(ctx, lay.width);
  drawStools(ctx);
  drawVending(ctx, fixtures(lay.width));
  if (lay.height >= 180) drawPlant(ctx, 14, lay.height - 10);
  lay.desks.forEach((d, i) => {
    drawDesk(ctx, d.x, d.top, agents[i].color);
    const r = rng(seed * 613 + i * 97 + 5);
    drawProp(ctx, d.x, d.top, PROPS[Math.floor(r() * PROPS.length)], r);
    drawSticky(ctx, d.x, d.top, r);
  });
  return c;
}
