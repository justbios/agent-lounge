import { CafeLayout, WALL_H } from "@/lib/cafe/layout";
import { AgentDef } from "@/lib/types";
import { drawDesks } from "./desk";
import { Ctx, LINE, px, rand, shade } from "./pixel";
import { THEMES, Theme } from "./theme";
import { drawWindow } from "./windows";

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

function drawFloor(ctx: Ctx, lay: CafeLayout, th: Theme) {
  for (let y = WALL_H, k = 0; y < lay.height; y += 5, k++) {
    px(ctx, 0, y, lay.width, 5, th.planks[k % th.planks.length]);
    px(ctx, 0, y + 4, lay.width, 1, th.plankLine);
    let x = Math.floor(rand(k * 7.3) * 40);
    while (x < lay.width) {
      px(ctx, x, y, 1, 4, th.plankGap);
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

function drawSignBoard(ctx: Ctx, fx: Fixtures) {
  const { x, y, w, h } = fx.SIGN;
  px(ctx, x - 1, y - 1, w + 2, h + 2, LINE);
  px(ctx, x, y, w, h, "#150f22");
  px(ctx, x, y, w, 1, "#2a2140");
  for (const [sx, sy] of [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4]]) {
    px(ctx, sx, sy, 1, 1, "#4b3a52");
  }
}

function drawChalkboard(ctx: Ctx, th: Theme) {
  const [frame, board, chalk] = th.board;
  px(ctx, 2, 5, 44, 30, LINE);
  px(ctx, 3, 6, 42, 28, frame);
  px(ctx, 5, 8, 38, 24, board);
  for (const [lx, ly, lw] of [[8, 11, 16], [8, 15, 24], [8, 19, 20], [8, 23, 26], [8, 27, 14]]) {
    for (let i = 0; i < lw; i++) if (rand(lx * 9 + ly * 13 + i) > 0.18) px(ctx, lx + i, ly, 1, 1, chalk);
    px(ctx, 37, ly, 3, 1, "#e8c46a");
  }
}

function drawSconce(ctx: Ctx, x: number, th: Theme) {
  const [body, rim, hi] = th.lamp;
  px(ctx, x - 1, 17, 2, 3, "#3a2f45");
  px(ctx, x - 4, 10, 8, 7, LINE);
  px(ctx, x - 3, 11, 6, 5, body);
  px(ctx, x - 3, 15, 6, 1, rim);
  px(ctx, x - 2, 11, 1, 3, hi);
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

function drawPattern(ctx: Ctx, width: number, th: Theme) {
  if (th.pattern === "boards") {
    for (let x = 3; x < width; x += 8) px(ctx, x, 0, 1, 37, th.wallLine);
    return;
  }
  if (th.pattern === "panels") {
    for (let y = 12; y < 37; y += 12) px(ctx, 0, y, width, 1, th.wallLine);
    for (let y = 0, r = 0; y < 37; y += 12, r++) {
      for (let x = (r % 2) * 16; x < width; x += 32) {
        px(ctx, x, y, 1, 12, th.wallLine);
        px(ctx, x + 2, y + 2, 1, 1, th.rail);
        px(ctx, x + 2, y + 9, 1, 1, th.rail);
      }
    }
    return;
  }
  const hi = shade(th.wall, 1.18);
  for (let y = 0, k = 0; y < 37; y += 6, k++) {
    px(ctx, 0, y, width, 1, hi);
    px(ctx, 0, y + 5, width, 1, th.wallLine);
    for (let x = Math.floor(rand(k * 5.1) * 60); x < width; x += 70 + Math.floor(rand(k * 9 + x) * 50)) px(ctx, x, y + 2, 2, 2, th.wallLine);
  }
}

function drawWall(ctx: Ctx, width: number, th: Theme) {
  const fx = fixtures(width);
  px(ctx, 0, 0, width, WALL_H, th.wall);
  drawPattern(ctx, width, th);
  px(ctx, 0, 37, width, 2, th.rail);
  px(ctx, 0, 39, width, 9, th.wainscot);
  for (let x = 8; x < width; x += 16) {
    px(ctx, x, 40, 1, 7, th.wainscotLines[0]);
    px(ctx, x + 1, 40, 1, 7, th.wainscotLines[1]);
  }
  px(ctx, 0, 48, width, 2, th.baseboard);
  fx.WINDOWS.forEach((w, i) => drawWindow(ctx, w.x, w.w, i, th));
  drawSignBoard(ctx, fx);
  drawChalkboard(ctx, th);
  fx.SCONCES.forEach((x) => drawSconce(ctx, x, th));
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

export function drawPlant(ctx: Ctx, x: number, baseY: number) {
  const leaves = [[0, -22, 3, 6], [-5, -19, 4, 5], [4, -19, 4, 5], [-7, -14, 4, 4], [5, -14, 4, 4], [-2, -17, 4, 7], [-4, -11, 3, 3], [3, -11, 3, 3]];
  for (const [dx, dy, w, h] of leaves) px(ctx, x + dx - 1, baseY + dy - 1, w + 2, h + 2, LINE);
  leaves.forEach(([dx, dy, w, h], i) => px(ctx, x + dx, baseY + dy, w, h, i % 2 ? "#2f7a4b" : "#3e9a5d"));
  px(ctx, x - 6, baseY - 9, 12, 10, LINE);
  px(ctx, x - 5, baseY - 8, 10, 8, "#8a4b2f");
  px(ctx, x - 5, baseY - 8, 10, 2, "#a65d3b");
}

/** Everything that never moves, rendered once per layout. */
export function buildRoom(lay: CafeLayout, agents: AgentDef[], seed = 1, th: Theme = THEMES.cafe): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = lay.width;
  c.height = lay.height;
  const ctx = c.getContext("2d")!;
  drawFloor(ctx, lay, th);
  drawRugs(ctx, lay);
  drawWall(ctx, lay.width, th);
  drawStools(ctx);
  drawVending(ctx, fixtures(lay.width));
  if (lay.height >= 180) drawPlant(ctx, 14, lay.height - 10);
  drawDesks(ctx, lay, agents, seed);
  return c;
}
