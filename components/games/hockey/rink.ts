"use client";

import { GOAL_W, H, MALLET_R, PUCK_R, W, startAt } from "@/lib/live/hockey";
import { rand, rgba, shade } from "../../cafe/pixel";
import { Ctx, INK, MINE, THEIRS, disc, ring } from "../fx";

/*
 * The rink as a place, painted once: night ice under the café's neon, its lines and face-off marks, the boards round
 * it with a dark tube the lights are drawn into, and a net at each end deep enough to hold the puck.
 */

/** the boards along the sides, and the deeper ends that hold the nets; units */
export const SIDE = 6;
export const END = 9;
export const FULL_W = W + 2 * SIDE;
export const FULL_H = H + 2 * END;
/** the ice's corners are rounded no further than a puck is, so nothing ever slides over the boards */
const CORNER = PUCK_R;
/** where a goal's mouth starts, from the left */
export const MOUTH = W / 2 - GOAL_W / 2;

export const PINK = "#ff6aa8";
export const CYAN = "#62f0ff";
export const VIOLET = "#a58bff";
/**
 * The puck's colour as it warms, and the light it throws: cool, warm, hot, red-hot. The warm one is a deeper orange
 * than the house amber, so that it is never taken for the gold of the viewer's own side.
 */
export const HEAT_GLOW = ["#ffffff", "#ffa53a", "#ff7a33", "#ff4d6d"] as const;
export const HEAT_TRAIL = ["#bfe6ff", "#ffc27a", "#ff9455", "#ff5a7a"] as const;
/** the tube round the boards: the house violet, then the puck's own heat */
export const TUBE = [VIOLET, HEAT_GLOW[1], HEAT_GLOW[2], HEAT_GLOW[3]] as const;
export const TUBE_OFF = "#2c2444";
export const CHIPS = ["#dff3ff", "#ffffff", "#a9d6f5"] as const;

/** The tube's straight runs as rectangles, broken at each goal: top, bottom, left, right. */
export const TUBE_RUNS: readonly (readonly [number, number, number, number])[] = [
  [-2, -2, MOUTH, 1],
  [MOUTH + GOAL_W + 2, -2, MOUTH, 1],
  [-2, H + 1, MOUTH, 1],
  [MOUTH + GOAL_W + 2, H + 1, MOUTH, 1],
  [-2, -2, 1, H + 4],
  [W + 1, -2, 1, H + 4],
];

/** how far round the boards a point on a wall is, clockwise from the top left corner; units */
export const RAIL_LEN = 2 * (W + H);
export function railOf(x: number, y: number, side: "top" | "right" | "bottom" | "left"): number {
  if (side === "top") return x;
  if (side === "right") return W + y;
  if (side === "bottom") return W + H + (W - x);
  return 2 * W + H + (H - y);
}

/** The unit of the tube that is at, or null in a goal's mouth. */
export function railAt(at: number): [number, number] | null {
  const s = Math.floor(((at % RAIL_LEN) + RAIL_LEN) % RAIL_LEN);
  const open = (x: number) => x >= MOUTH - 2 && x < MOUTH + GOAL_W + 2;
  if (s < W) return open(s) ? null : [s, -2];
  if (s < W + H) return [W + 1, s - W];
  if (s < 2 * W + H) {
    const x = W - 1 - (s - W - H);
    return open(x) ? null : [x, H + 1];
  }
  return [-2, H - 1 - (s - 2 * W - H)];
}

const softs = new Map<string, HTMLCanvasElement>();

function soft(color: string): HTMLCanvasElement {
  let g = softs.get(color);
  if (g) return g;
  g = document.createElement("canvas");
  g.width = g.height = 64;
  const c = g.getContext("2d")!;
  const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, rgba(color, 0.85));
  grad.addColorStop(0.35, rgba(color, 0.36));
  grad.addColorStop(1, rgba(color, 0));
  c.fillStyle = grad;
  c.fillRect(0, 0, 64, 64);
  softs.set(color, g);
  return g;
}

/** A soft light of one colour stretched over a rectangle and added to what is under it: a lamp's pool, a spotlight. */
export function beam(ctx: Ctx, color: string, x: number, y: number, w: number, h: number, a: number) {
  if (a <= 0.01) return;
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(soft(color), x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = op;
}

/**
 * The light a tube throws: even along the rectangle's length, fading across it. `upright` for a tube that runs up
 * and down.
 */
export function tubeGlow(ctx: Ctx, color: string, x: number, y: number, w: number, h: number, a: number, upright = false) {
  if (a <= 0.01) return;
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, a);
  if (upright) ctx.drawImage(soft(color), 0, 31, 64, 2, x, y, w, h);
  else ctx.drawImage(soft(color), 31, 0, 2, 64, x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = op;
}

/** A face-off dot with its four ticks. */
function dot(ctx: Ctx, x: number, y: number, color: string) {
  disc(ctx, x, y, 1, color);
  ctx.fillStyle = color;
  for (const [dx, dy, w, h] of [
    [-4.5, -0.5, 2, 1],
    [2.5, -0.5, 2, 1],
    [-0.5, -4.5, 1, 2],
    [-0.5, 2.5, 1, 2],
  ]) {
    ctx.fillRect(x + dx, y + dy, w, h);
  }
}

/** One end's net, seen from above: the pocket, its frame and the two posts. `dir` is 1 for the top end, -1 for the bottom. */
function goal(ctx: Ctx, dir: 1 | -1, color: string) {
  const y0 = dir > 0 ? -END : H;
  ctx.fillStyle = INK;
  ctx.fillRect(MOUTH - 3, y0, GOAL_W + 6, END);
  ctx.fillStyle = "#120e1c";
  ctx.fillRect(MOUTH, dir > 0 ? y0 + 1 : y0, GOAL_W, END - 1);
  // the frame: a back bar and two sides, lit from the top left
  ctx.fillStyle = "#8f9bb3";
  ctx.fillRect(MOUTH - 2, dir > 0 ? y0 : y0 + END - 1, GOAL_W + 4, 1);
  ctx.fillRect(MOUTH - 2, y0, 1, END);
  ctx.fillRect(MOUTH + GOAL_W + 1, y0, 1, END);
  ctx.fillStyle = "#5d6781";
  ctx.fillRect(MOUTH - 1, dir > 0 ? y0 + 1 : y0, 1, END - 1);
  ctx.fillRect(MOUTH + GOAL_W, dir > 0 ? y0 + 1 : y0, 1, END - 1);
  // the posts, where the mouth meets the ice
  for (const px of [MOUTH - 2, MOUTH + GOAL_W]) {
    ctx.fillStyle = "#f4f7ff";
    ctx.fillRect(px, dir > 0 ? -2 : H, 2, 2);
    ctx.fillStyle = shade(color, 1.1);
    ctx.fillRect(px, dir > 0 ? -1 : H, 2, 1);
  }
}

/** The ice, the lines, the boards and the nets; drawn in units with the ice's corner at (0, 0). */
export function paintRink(ctx: Ctx) {
  // what is round the rink: the dark of the hall
  ctx.fillStyle = INK;
  ctx.fillRect(-SIDE, -END, FULL_W, FULL_H);

  // the boards: a cap lit from the top left, seams along it, the tube's dark bed inside
  ctx.fillStyle = "#2a2140";
  ctx.fillRect(-SIDE + 1, -SIDE + 1, FULL_W - 2, H + 2 * SIDE - 2);
  ctx.fillStyle = "#4a3c6b";
  ctx.fillRect(-SIDE + 1, -SIDE + 1, FULL_W - 2, 1);
  ctx.fillRect(-SIDE + 1, -SIDE + 1, 1, H + 2 * SIDE - 2);
  ctx.fillStyle = "#1b1530";
  ctx.fillRect(-SIDE + 1, H + SIDE - 2, FULL_W - 2, 1);
  ctx.fillRect(W + SIDE - 2, -SIDE + 1, 1, H + 2 * SIDE - 2);
  ctx.fillStyle = "#1b1530";
  for (let y = 9; y < H; y += 18) {
    ctx.fillRect(-SIDE + 2, y, 2, 1);
    ctx.fillRect(W + 2, y, 2, 1);
  }
  for (let x = 9; x < W; x += 18) {
    ctx.fillRect(x, -SIDE + 2, 1, 2);
    ctx.fillRect(x, H + 2, 1, 2);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(-3, -3, W + 6, H + 6);
  ctx.fillStyle = TUBE_OFF;
  for (const [x, y, w, h] of TUBE_RUNS) ctx.fillRect(x, y, w, h);

  // the ice: darker toward the boards, a pool of light under each lamp, a grain so it is not flat
  const ice = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, H * 0.7);
  ice.addColorStop(0, "#1d406d");
  ice.addColorStop(1, "#0f2140");
  ctx.fillStyle = ice;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  for (const ly of [H * 0.18, H * 0.5, H * 0.82]) beam(ctx, "#8fc6ff", W / 2 - 46, ly - 30, 92, 60, 0.16);
  for (let i = 0; i < 520; i++) {
    const x = Math.floor(rand(i * 3 + 1) * W);
    const y = Math.floor(rand(i * 3 + 2) * H);
    const lit = rand(i * 3 + 3);
    ctx.fillStyle = lit > 0.5 ? "rgba(190,225,255,0.07)" : "rgba(4,10,26,0.14)";
    ctx.fillRect(x, y, lit > 0.86 ? 2 : 1, 0.5);
  }
  // a sheen, as ice has under lamps: short strokes on the slant
  ctx.fillStyle = "rgba(200,232,255,0.055)";
  for (let i = 0; i < 26; i++) {
    const x = rand(i * 7 + 5) * (W - 16);
    const y = rand(i * 7 + 6) * (H - 16) + 12;
    for (let j = 0; j < 5 + Math.floor(rand(i * 7 + 7) * 7); j++) ctx.fillRect(Math.floor(x + j), Math.floor(y - j), 1, 1);
  }

  // each side's crease in its own colour, and the mark its puck comes down on
  for (const [gy, color, from, to, sy] of [
    [0, THEIRS, 0, Math.PI, startAt("o").y],
    [H, MINE, Math.PI, Math.PI * 2, startAt("x").y],
  ] as const) {
    ctx.globalAlpha = 0.1;
    disc(ctx, W / 2, gy, 17, color);
    ctx.globalAlpha = 0.62;
    ring(ctx, W / 2, gy, 17, color, from, to);
    ctx.globalAlpha = 0.5;
    ring(ctx, W / 2, sy, 5, PINK);
    ctx.globalAlpha = 0.8;
    disc(ctx, W / 2, sy, 1, PINK);
    ctx.globalAlpha = 1;
  }

  // the lines: two cyan ones for the zones, the pink one across the middle with its circle
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = CYAN;
  ctx.fillRect(0, Math.round(H * 0.3), W, 1);
  ctx.fillRect(0, Math.round(H * 0.7) - 1, W, 1);
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = PINK;
  ctx.fillRect(0, H / 2 - 0.5, W, 1);
  ring(ctx, W / 2, H / 2, 14, PINK);
  ctx.globalAlpha = 0.85;
  disc(ctx, W / 2, H / 2, 1, CYAN);
  ctx.globalAlpha = 0.55;
  for (const fy of [H * 0.165, H * 0.835]) {
    dot(ctx, 15, Math.round(fy), PINK);
    dot(ctx, W - 15, Math.round(fy), PINK);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // the corners: the ice turns, the board fills what is left
  for (const [cx, cy, sx, sy] of [
    [0, 0, 1, 1],
    [W, 0, -1, 1],
    [0, H, 1, -1],
    [W, H, -1, -1],
  ]) {
    for (let i = 0; i < CORNER; i++) {
      for (let j = 0; j < CORNER; j++) {
        const d = Math.hypot(CORNER - i - 0.5, CORNER - j - 0.5);
        if (d <= CORNER) continue;
        ctx.fillStyle = d <= CORNER + 1 ? "#3a3157" : INK;
        ctx.fillRect(sx > 0 ? cx + i : cx - i - 1, sy > 0 ? cy + j : cy - j - 1, 1, 1);
      }
    }
  }

  goal(ctx, 1, THEIRS);
  goal(ctx, -1, MINE);
}

/** A net's mesh, as wide as the mouth and as deep as the pocket: painted once, laid over whatever is in the net. */
export function paintMesh(ctx: Ctx) {
  for (let y = 0; y < END - 1; y++) {
    for (let x = (y % 2) * 1; x < GOAL_W; x += 2) {
      ctx.fillStyle = (x + y) % 4 < 2 ? "rgba(214,224,245,0.34)" : "rgba(214,224,245,0.2)";
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** A mallet's body seen from above, lit from the top left; its knob is a sprite of its own, so it can lean. */
export function paintBody(ctx: Ctx, color: string) {
  const c = MALLET_R + 1.5;
  disc(ctx, c, c, MALLET_R, INK);
  disc(ctx, c, c, MALLET_R - 1, shade(color, 0.66));
  disc(ctx, c - 1, c - 1, MALLET_R - 2, color);
  ring(ctx, c, c, MALLET_R - 2, shade(color, 1.32), Math.PI * 1.05, Math.PI * 1.5);
  ring(ctx, c, c, 3, shade(color, 0.5));
}

export function paintKnob(ctx: Ctx, color: string) {
  const c = 4.5;
  disc(ctx, c, c, 3, shade(color, 0.48));
  disc(ctx, c, c, 2, shade(color, 1.2));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(c - 1.5, c - 1.5, 1, 1);
}

/** The puck, cool to red-hot. */
export function paintPuck(ctx: Ctx, heat: number) {
  const c = PUCK_R + 1.5;
  const body = ["#f1ebdb", "#ffd08a", "#ffa257", "#ff5a6e"][heat];
  const groove = ["#c4b99f", "#e08a2e", "#dc5524", "#fff3e0"][heat];
  disc(ctx, c, c, PUCK_R, INK);
  disc(ctx, c, c, PUCK_R - 1, body);
  if (heat === 3) disc(ctx, c, c, 2, groove);
  else ring(ctx, c, c, 2, groove);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(c - 2.5, c - 2.5, 2, 1);
}

/** The white a mallet's rim flashes as it strikes. */
export function paintFlash(ctx: Ctx) {
  const c = MALLET_R + 1.5;
  ring(ctx, c, c, MALLET_R, "#ffffff");
  ring(ctx, c, c, MALLET_R - 1, "#ffffff");
}

/** A round shadow, painted once and laid under whatever stands on the ice. */
export function paintShadow(ctx: Ctx, r: number) {
  disc(ctx, r + 0.5, r + 0.5, r, "#02040c");
}
