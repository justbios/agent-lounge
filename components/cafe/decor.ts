import { CafeLayout } from "@/lib/cafe/layout";
import type { Decor } from "@/lib/live/achievements";
import { Ctx, LINE, glow, paint, px, shade } from "./pixel";
import { drawPlant, fixtures } from "./room";

export type DecorSet = ReadonlySet<Decor>;

const GOLD = "#ffd25a";
const BULBS = ["#ff4fa3", "#ffd25a", "#5ce1ff", "#4ade80"];
const FLOOR_Y = 132;

function tri(x: number): number {
  const f = x % 2;
  return f < 1 ? f : 2 - f;
}

function garlandBulbs(width: number): { x: number; y: number; k: number }[] {
  const out: { x: number; y: number; k: number }[] = [];
  for (let x = 4, k = 0; x < width - 2; x += 8, k++) out.push({ x, y: 2 + Math.round(2 * Math.sin((Math.PI * (x % 32)) / 32)), k });
  return out;
}

function drawGarland(ctx: Ctx, width: number, t: number, lit: boolean) {
  if (!lit) for (let x = 0; x < width; x++) px(ctx, x, 1 + Math.round(2 * Math.sin((Math.PI * (x % 32)) / 32)), 1, 1, "#2a2236");
  for (const b of garlandBulbs(width)) {
    const on = (Math.floor(t * 2) + b.k) % 3 !== 0;
    const c = BULBS[b.k % BULBS.length];
    if (lit) {
      if (on) glow(ctx, b.x + 1, b.y + 2, 5, c, 0.35);
    } else px(ctx, b.x, b.y + 1, 2, 2, on ? c : shade(c, 0.4));
  }
}

function drawTrophy(ctx: Ctx, width: number) {
  const { VENDING } = fixtures(width);
  const x = VENDING.x + 1;
  paint(
    ctx,
    [[x, 34, 7, 3], [x + 3, 32, 1, 2], [x + 1, 27, 5, 5], [x, 28, 1, 2], [x + 6, 28, 1, 2]],
    [
      [x, 34, 7, 3, "#6b4a35"],
      [x + 1, 35, 5, 1, "#ffd25a"],
      [x + 3, 32, 1, 2, "#c9962a"],
      [x + 1, 27, 5, 5, GOLD],
      [x + 1, 31, 5, 1, "#c9962a"],
      [x, 28, 1, 2, "#c9962a"],
      [x + 6, 28, 1, 2, "#c9962a"],
      [x + 2, 28, 1, 2, "#fff1b0"],
    ],
  );
}

function drawOwl(ctx: Ctx, t: number) {
  const x = 54 + 70 - 12;
  paint(
    ctx,
    [[x, 24, 7, 9], [x, 23, 1, 1], [x + 6, 23, 1, 1]],
    [
      [x, 23, 1, 2, "#6b4f36"],
      [x + 6, 23, 1, 2, "#6b4f36"],
      [x, 24, 7, 9, "#8a6a4a"],
      [x, 28, 1, 4, "#6b4f36"],
      [x + 6, 28, 1, 4, "#6b4f36"],
      [x + 1, 25, 5, 3, "#c9a87a"],
      [x + 2, 29, 3, 3, "#d9c09a"],
      [x + 3, 30, 1, 1, "#a8875f"],
      [x + 3, 27, 1, 1, "#e8913a"],
      [x + 2, 32, 1, 1, "#e8913a"],
      [x + 4, 32, 1, 1, "#e8913a"],
    ],
  );
  const blink = t % 4.2 < 0.16;
  for (const ex of [x + 1, x + 4]) {
    if (blink) px(ctx, ex, 26, 2, 1, "#6b4f36");
    else {
      px(ctx, ex, 25, 2, 2, GOLD);
      px(ctx, ex + (ex === x + 1 ? 1 : 0), 26, 1, 1, LINE);
    }
  }
}

function drawArcade(ctx: Ctx, t: number) {
  const x = 4;
  const b = FLOOR_Y;
  paint(
    ctx,
    [[x, b - 30, 14, 30]],
    [
      [x, b - 30, 14, 30, "#3b2a6b"],
      [x, b - 30, 2, 30, "#2a1d4f"],
      [x + 2, b - 29, 11, 4, "#ff4fa3"],
      [x + 3, b - 28, 1, 2, "#ffd1e8"],
      [x + 5, b - 28, 1, 2, "#ffd1e8"],
      [x + 7, b - 28, 1, 2, "#ffd1e8"],
      [x + 9, b - 28, 2, 2, "#ffd1e8"],
      [x + 2, b - 24, 11, 9, LINE],
      [x + 3, b - 23, 9, 7, "#0b0f1a"],
      [x + 1, b - 14, 13, 3, "#5b4a8b"],
      [x + 4, b - 16, 1, 3, LINE],
      [x + 3, b - 17, 3, 2, "#ff5d5d"],
      [x + 8, b - 14, 2, 1, GOLD],
      [x + 11, b - 14, 2, 1, "#4cc9f0"],
      [x + 5, b - 8, 4, 2, "#1a1426"],
      [x + 6, b - 8, 1, 1, "#ffb15e"],
    ],
  );
  const shift = Math.round(tri(t * 0.5) * 3);
  for (let k = 0; k < 3; k++) px(ctx, x + 3 + shift + k * 2, b - 22 + (k % 2), 1, 1, "#4ade80");
  const ship = x + 3 + Math.round(tri(t * 0.8) * 7);
  px(ctx, ship, b - 17, 2, 1, GOLD);
  px(ctx, ship, b - 18 - (Math.floor(t * 6) % 4), 1, 1, "#ffffff");
}

function drawAquarium(ctx: Ctx, t: number) {
  const x = 22;
  const b = FLOOR_Y;
  paint(
    ctx,
    [[x, b - 22, 18, 22]],
    [
      [x, b - 9, 18, 9, "#5e4232"],
      [x, b - 9, 18, 1, "#8a6448"],
      [x + 3, b - 6, 12, 1, "#4a3326"],
      [x, b - 22, 18, 13, "#9fd4ee"],
      [x + 1, b - 21, 16, 11, "#1d4e7a"],
      [x + 1, b - 21, 16, 1, "#5ab0e0"],
      [x + 1, b - 12, 16, 2, "#d9c08a"],
    ],
  );
  const sway = Math.round(Math.sin(t * 1.6));
  px(ctx, x + 4, b - 16, 1, 4, "#3e9a5d");
  px(ctx, x + 4 + sway, b - 18, 1, 2, "#3e9a5d");
  px(ctx, x + 13, b - 15, 1, 3, "#2f7a4b");
  px(ctx, x + 13 - sway, b - 17, 1, 2, "#2f7a4b");
  const fishes: [number, number, string][] = [[0.23, b - 17, "#ff9a3c"], [0.31, b - 14, "#ffd25a"]];
  fishes.forEach(([speed, y, c], i) => {
    const p = tri(t * speed + i * 0.7);
    const fx = x + 2 + Math.round(p * 11);
    const right = (t * speed + i * 0.7) % 2 < 1;
    px(ctx, fx, y, 3, 2, c);
    px(ctx, right ? fx - 1 : fx + 3, y, 1, 2, shade(c, 0.7));
    px(ctx, right ? fx + 2 : fx, y, 1, 1, LINE);
  });
  const rise = (t * 5) % 9;
  px(ctx, x + 15, b - 12 - Math.round(rise), 1, 1, "#bfe6ff");
}

function drawExtinguisher(ctx: Ctx, width: number) {
  const x = fixtures(width).VENDING.x - 9;
  paint(
    ctx,
    [[x, 39, 5, 9], [x + 1, 37, 3, 2]],
    [
      [x + 1, 37, 3, 2, "#3a3550"],
      [x, 39, 5, 9, "#d63a3a"],
      [x + 1, 40, 1, 7, "#ff7a7a"],
      [x, 42, 5, 1, "#ece4d6"],
    ],
  );
  px(ctx, x + 4, 38, 2, 1, LINE);
  px(ctx, x + 5, 39, 1, 5, LINE);
}

/** Decor the user has earned, drawn over the static room before anyone sits down. */
export function drawDecor(ctx: Ctx, lay: CafeLayout, decor: DecorSet, t: number) {
  if (!decor.size) return;
  if (decor.has("garland")) drawGarland(ctx, lay.width, t, false);
  if (decor.has("trophy")) drawTrophy(ctx, lay.width);
  if (decor.has("owl")) drawOwl(ctx, t);
  if (decor.has("extinguisher")) drawExtinguisher(ctx, lay.width);
  if (decor.has("arcade")) drawArcade(ctx, t);
  if (decor.has("aquarium")) drawAquarium(ctx, t);
  if (decor.has("plant")) drawPlant(ctx, lay.width - 14, Math.min(lay.height - 4, FLOOR_Y));
}

/** The decor's own light, added after the room is dimmed. */
export function drawDecorLights(ctx: Ctx, lay: CafeLayout, decor: DecorSet, t: number) {
  if (!decor.size) return;
  ctx.globalCompositeOperation = "lighter";
  if (decor.has("garland")) drawGarland(ctx, lay.width, t, true);
  if (decor.has("arcade")) glow(ctx, 11, FLOOR_Y - 19, 14, "#5ce1ff", 0.16);
  if (decor.has("aquarium")) glow(ctx, 31, FLOOR_Y - 16, 14, "#5ab0e0", 0.14);
  if (decor.has("goldMachine")) glow(ctx, 10, 56, 14, GOLD, 0.12);
  if (decor.has("owl")) glow(ctx, 54 + 70 - 9, 26, 6, GOLD, 0.12);
  ctx.globalCompositeOperation = "source-over";
}
