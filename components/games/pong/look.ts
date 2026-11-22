"use client";

import { GAP, H, MAX_SPEED, PAD_W, SPEED, W } from "@/lib/live/pong";
import { rand } from "../../cafe/pixel";
import { Ctx } from "../fx";

/** the rails, the net and the marks of a table at rest */
export const CHALK = "#dff5ea";
export const MINT = "#9ff5d9";
/** the colour a point that can end the match is told in when it is both players' */
export const PINK = "#ff6aa8";
export const BALL = "#f6f1e4";

/** where each paddle's face is, as the viewer sees the table: their own on the left, the other player's on the right */
export const FACE_L = GAP + PAD_W;
export const FACE_R = W - GAP - PAD_W;
export const SPAN = FACE_R - FACE_L;
/** how far from the paddle it left the ball comes down on the table: well into the other half */
export const DROP = 104;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** How hot a ball is, 0 to 1: nothing at a serve's pace, all the way at the fastest a ball gets. */
export const heatOf = (vx: number, vy: number): number =>
  clamp01((Math.sqrt(vx * vx + vy * vy) - SPEED) / (MAX_SPEED - SPEED));

/** from a served ball's cream through peach and coral to the pink of a rally at full tilt */
const STOPS: readonly [number, number, number, number][] = [
  [0, 0xff, 0xf3, 0xc8],
  [0.3, 0xff, 0xd0, 0x8c],
  [0.6, 0xff, 0x93, 0x70],
  [0.85, 0xff, 0x6a, 0xa8],
  [1, 0xff, 0x8c, 0xdc],
];
const STEPS = 32;
const RAMP: string[] = [];
for (let i = 0; i <= STEPS; i++) {
  const t = i / STEPS;
  let k = 0;
  while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
  const [t0, r0, g0, b0] = STOPS[k];
  const [t1, r1, g1, b1] = STOPS[k + 1];
  const f = clamp01((t - t0) / (t1 - t0));
  const c = (a: number, b: number) => Math.round(a + (b - a) * f).toString(16).padStart(2, "0");
  RAMP.push(`#${c(r0, r1)}${c(g0, g1)}${c(b0, b1)}`);
}

/** The colour of that much heat, 0 to 1. */
export const hot = (heat: number): string => RAMP[Math.round(clamp01(heat) * STEPS)];

/**
 * How high over the table the ball is, 0 to about 1, from where it is on its way across: off the paddle it rises
 * over the net, comes down on the other half and is on its way up again when the other paddle meets it. It is only
 * a picture of height (a shadow that parts from the ball, a ball a little bigger), the game itself is flat.
 */
export function lift(x: number, right: boolean): number {
  const u = right ? x - FACE_L : FACE_R - x;
  if (u <= 0) return 0.5;
  if (u < DROP) {
    const p = u / DROP;
    return 0.5 * (1 - p) + 3.4 * p * (1 - p);
  }
  const q = Math.min(1.5, (u - DROP) / (SPAN - DROP));
  return 0.5 * q * (2 - q);
}

/** How far across the table a ball is from the paddle it left, in units. */
export const along = (x: number, right: boolean): number => (right ? x - FACE_L : FACE_R - x);

/**
 * The table at rest, painted once: felt lit from over the middle and falling off into the night, a woven grain, a
 * darker gutter behind each paddle, the faint marks of a table, and the shade the rails and the net cast on it.
 */
export function paintTable(ctx: Ctx, k: number) {
  const felt = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.66);
  felt.addColorStop(0, "#1b5a4b");
  felt.addColorStop(0.5, "#0f3b35");
  felt.addColorStop(1, "#06161a");
  ctx.fillStyle = felt;
  ctx.fillRect(0, 0, W, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = rand(x * 7.13 + y * 131.7);
      if (r < 0.13) {
        ctx.fillStyle = "rgba(255,255,255,0.024)";
        ctx.fillRect(x, y, 1, 1);
      } else if (r > 0.86) {
        ctx.fillStyle = "rgba(0,0,0,0.075)";
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // the gutters: the strip behind each paddle is out of play, and darker
  for (let i = 0; i < FACE_L; i++) {
    ctx.fillStyle = `rgba(3,2,8,${0.5 * (1 - i / FACE_L)})`;
    ctx.fillRect(i, 0, 1, H);
    ctx.fillRect(W - 1 - i, 0, 1, H);
  }

  // the marks: the line along the middle of the table, a box round each half, a tick where a ball comes down
  ctx.fillStyle = "rgba(180,240,220,0.11)";
  for (let x = FACE_L + 3; x < FACE_R - 3; x += 4) ctx.fillRect(x, H / 2 - 0.25, 2, 0.5);
  ctx.fillStyle = "rgba(180,240,220,0.07)";
  for (const x of [FACE_L + 1, FACE_R - 1.5]) ctx.fillRect(x, 5, 0.5, H - 10);
  ctx.fillRect(FACE_L + 1, 5, SPAN - 2, 0.5);
  ctx.fillRect(FACE_L + 1, H - 5.5, SPAN - 2, 0.5);
  ctx.fillStyle = "rgba(180,240,220,0.13)";
  for (const x of [FACE_L + DROP, FACE_R - DROP]) {
    ctx.fillRect(x - 0.25, H / 2 - 2, 0.5, 4);
    ctx.fillRect(x - 2, H / 2 - 0.25, 4, 0.5);
  }

  // shade under the rails and beside the net: they stand a little over the felt
  for (const [y, a] of [
    [1, 0.34],
    [2, 0.16],
    [H - 2, 0.34],
    [H - 3, 0.16],
  ]) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, y, W, 1);
  }
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(W / 2 + 0.5, 2, 1, H - 4);

  // the rails' own light, which the rails drawn every frame sit in
  ctx.save();
  ctx.shadowColor = MINT;
  ctx.shadowBlur = 2.5 * k;
  ctx.fillStyle = "rgba(223,245,234,0.5)";
  ctx.fillRect(0, 0, W, 1);
  ctx.fillRect(0, H - 1, W, 1);
  ctx.restore();
}

/** The night closing in round the middle of the table, for a point that can end the match. */
export function paintDusk(ctx: Ctx) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, "rgba(4,2,10,0)");
  g.addColorStop(1, "rgba(4,2,10,0.62)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
