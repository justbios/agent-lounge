import { ItemId } from "@/lib/live/interior";
import { drawAquarium, drawArcade, drawOwl } from "./decor";
import { Ctx, LINE, glow, px, shade } from "./pixel";
import { RARE_DRAW, rareLight } from "./rare";
import { drawPlant } from "./room";

type Draw = (ctx: Ctx, L: number, B: number, t: number) => void;

function candle(ctx: Ctx, L: number, B: number, t: number) {
  px(ctx, L - 1, B - 3, 7, 3, LINE);
  px(ctx, L, B - 2, 5, 2, "#8a6a4a");
  px(ctx, L + 1, B - 8, 3, 6, LINE);
  px(ctx, L + 2, B - 7, 1, 5, "#f1e6cf");
  const tall = Math.floor(t * 7) % 3 === 0;
  px(ctx, L + 2, B - (tall ? 10 : 9), 1, tall ? 2 : 1, "#ffd25a");
  px(ctx, L + 2, B - 8, 1, 1, "#ff9a3c");
}

function cactus(ctx: Ctx, L: number, B: number) {
  px(ctx, L + 2, B - 10, 3, 7, LINE);
  px(ctx, L, B - 8, 2, 3, LINE);
  px(ctx, L + 5, B - 9, 2, 3, LINE);
  px(ctx, L + 3, B - 9, 1, 6, "#3e9a5d");
  px(ctx, L + 2, B - 9, 1, 6, "#2f7a4b");
  px(ctx, L + 4, B - 9, 1, 6, "#57b874");
  px(ctx, L + 1, B - 7, 1, 2, "#3e9a5d");
  px(ctx, L + 5, B - 8, 1, 2, "#3e9a5d");
  px(ctx, L + 3, B - 10, 1, 1, "#ff6fae");
  px(ctx, L - 1, B - 4, 9, 4, LINE);
  px(ctx, L, B - 4, 7, 4, "#a65d3b");
  px(ctx, L, B - 4, 7, 1, "#c4744d");
}

function luckycat(ctx: Ctx, L: number, B: number, t: number) {
  const wave = Math.floor(t * 3) % 2;
  px(ctx, L - 1, B - 9, 9, 9, LINE);
  px(ctx, L, B - 8, 7, 8, "#f4efe6");
  px(ctx, L, B - 10, 2, 2, LINE);
  px(ctx, L + 5, B - 10, 2, 2, LINE);
  px(ctx, L + 1, B - 9, 1, 1, "#ff9ab8");
  px(ctx, L + 5, B - 9, 1, 1, "#ff9ab8");
  px(ctx, L + 2, B - 6, 1, 1, LINE);
  px(ctx, L + 4, B - 6, 1, 1, LINE);
  px(ctx, L, B - 4, 7, 1, "#d63a3a");
  px(ctx, L + 3, B - 3, 1, 1, "#ffd25a");
  px(ctx, L + 6, B - 8 - wave, 2, 3, LINE);
  px(ctx, L + 7, B - 8 - wave, 1, 2, "#f4efe6");
}

function bonsai(ctx: Ctx, L: number, B: number) {
  for (const [dx, dy, w] of [[0, -10, 5], [5, -9, 6], [2, -8, 6]] as const) {
    px(ctx, L + dx - 1, B + dy - 1, w + 2, 4, LINE);
  }
  px(ctx, L + 0, B - 10, 5, 2, "#3e9a5d");
  px(ctx, L + 5, B - 9, 6, 2, "#2f7a4b");
  px(ctx, L + 2, B - 8, 6, 2, "#57b874");
  px(ctx, L + 5, B - 6, 1, 3, "#6b4f36");
  px(ctx, L + 4, B - 5, 1, 2, "#6b4f36");
  px(ctx, L - 1, B - 3, 13, 3, LINE);
  px(ctx, L, B - 3, 11, 3, "#3a5a7a");
  px(ctx, L, B - 3, 11, 1, "#5a7fa3");
}

function catbed(ctx: Ctx, L: number, B: number) {
  px(ctx, L, B - 6, 14, 6, LINE);
  px(ctx, L + 1, B - 5, 12, 5, "#7a2d3a");
  px(ctx, L + 1, B - 5, 12, 1, "#a04254");
  px(ctx, L + 3, B - 4, 8, 3, "#d9a978");
  px(ctx, L + 3, B - 4, 8, 1, "#ecc597");
}

function lamp(ctx: Ctx, L: number, B: number) {
  const c = L + 4;
  px(ctx, c - 3, B - 3, 7, 3, LINE);
  px(ctx, c - 2, B - 2, 5, 2, "#2a2630");
  px(ctx, c - 1, B - 22, 3, 20, LINE);
  px(ctx, c, B - 22, 1, 20, "#5b5470");
  px(ctx, L - 1, B - 29, 11, 8, LINE);
  px(ctx, L + 1, B - 28, 7, 1, "#f4dc9a");
  px(ctx, L, B - 27, 9, 5, "#e8c46a");
  px(ctx, L, B - 23, 9, 1, "#c99a3e");
}

function palm(ctx: Ctx, L: number, B: number, t: number) {
  const c = L + 7;
  const sway = Math.round(Math.sin(t * 0.9));
  px(ctx, c - 1, B - 22, 3, 14, LINE);
  for (let y = B - 21; y < B - 8; y += 3) {
    px(ctx, c, y, 1, 2, "#8a6a4a");
    px(ctx, c, y + 2, 1, 1, "#6b4f36");
  }
  const fronds: [number, number, number][] = [[-7, -26, 7], [1, -27, 7], [-6, -23, 5], [2, -23, 6], [-2, -28, 4]];
  for (const [dx, dy, w] of fronds) px(ctx, c + dx + sway - 1, B + dy - 1, w + 2, 3, LINE);
  fronds.forEach(([dx, dy, w], i) => px(ctx, c + dx + sway, B + dy, w, 1, i % 2 ? "#2f7a4b" : "#3e9a5d"));
  px(ctx, c - 6 + sway, B - 25, 1, 2, "#2f7a4b");
  px(ctx, c + 7 + sway, B - 25, 1, 2, "#2f7a4b");
  px(ctx, L + 1, B - 9, 12, 9, LINE);
  px(ctx, L + 2, B - 8, 10, 8, "#8a4b2f");
  px(ctx, L + 2, B - 7, 10, 1, "#5e3220");
  px(ctx, L + 2, B - 3, 10, 1, "#5e3220");
  px(ctx, L + 2, B - 8, 2, 8, "#a65d3b");
}

const BOOKS = ["#d63a3a", "#5aa9e6", "#ffd25a", "#4ade80", "#b07ae0", "#ff9a3c", "#ece4d6"];

function shelf(ctx: Ctx, L: number, B: number) {
  px(ctx, L - 1, B - 31, 20, 31, LINE);
  px(ctx, L, B - 30, 18, 30, "#6b4a35");
  px(ctx, L + 1, B - 29, 16, 28, "#3a281e");
  for (let r = 0; r < 3; r++) {
    const y = B - 29 + r * 9;
    let x = L + 2;
    for (let k = 0; x < L + 16; k++) {
      const w = 2 + ((r * 5 + k * 3) % 2);
      const h = 6 + ((r + k) % 3 === 0 ? 0 : 1);
      if (x + w > L + 16) break;
      px(ctx, x, y + 8 - h, w, h, BOOKS[(r * 3 + k) % BOOKS.length]);
      px(ctx, x, y + 8 - h, 1, h, shade(BOOKS[(r * 3 + k) % BOOKS.length], 0.75));
      x += w + (k % 4 === 3 ? 2 : 0);
    }
    px(ctx, L + 1, y + 8, 16, 1, "#8a6448");
  }
  px(ctx, L, B - 1, 18, 1, "#4a3326");
}

function gramophone(ctx: Ctx, L: number, B: number, t: number) {
  px(ctx, L - 1, B - 7, 14, 7, LINE);
  px(ctx, L, B - 6, 12, 6, "#7a4a2a");
  px(ctx, L, B - 6, 12, 1, "#9c6a42");
  px(ctx, L + 1, B - 3, 10, 1, "#5e3a20");
  px(ctx, L + 1, B - 8, 7, 2, "#1a1a20");
  px(ctx, L + 1 + (Math.floor(t * 8) % 6), B - 8, 1, 1, "#5a5a68");
  px(ctx, L + 8, B - 13, 1, 6, "#c9962a");
  px(ctx, L + 6, B - 18, 7, 6, LINE);
  px(ctx, L + 7, B - 17, 5, 4, "#d9a93a");
  px(ctx, L + 8, B - 16, 3, 2, "#7a5a1a");
  const k = (t * 0.7) % 1;
  if (k < 0.8) {
    const y = B - 20 - Math.round(k * 10);
    const x = L + 12 + Math.round(Math.sin(k * 6) * 2);
    px(ctx, x, y, 1, 3, "#ece4d6");
    px(ctx, x - 1, y + 2, 1, 1, "#ece4d6");
  }
}

function couch(ctx: Ctx, L: number, B: number) {
  px(ctx, L - 1, B - 15, 32, 13, LINE);
  px(ctx, L + 3, B - 14, 24, 7, "#4a6b8a");
  px(ctx, L + 3, B - 14, 24, 1, "#6a8bab");
  px(ctx, L + 15, B - 13, 1, 6, "#3a5570");
  px(ctx, L + 3, B - 7, 24, 3, "#5b7fa3");
  px(ctx, L + 15, B - 7, 1, 3, "#3a5570");
  for (const x of [L, L + 27]) {
    px(ctx, x, B - 11, 3, 8, "#3a5570");
    px(ctx, x, B - 11, 3, 1, "#5b7fa3");
  }
  px(ctx, L, B - 4, 30, 2, "#2e4560");
  for (const x of [L + 1, L + 27]) px(ctx, x, B - 2, 2, 2, "#2a1d14");
}

const JUKE = ["#ff4fa3", "#ffd25a", "#5ce1ff", "#4ade80"];

function jukebox(ctx: Ctx, L: number, B: number, t: number) {
  const k = Math.floor(t * 2);
  px(ctx, L - 1, B - 26, 18, 26, LINE);
  px(ctx, L + 2, B - 27, 12, 1, LINE);
  px(ctx, L, B - 25, 16, 25, "#5a2d3a");
  px(ctx, L + 2, B - 26, 12, 2, JUKE[k % 4]);
  px(ctx, L, B - 24, 2, 16, JUKE[(k + 1) % 4]);
  px(ctx, L + 14, B - 24, 2, 16, JUKE[(k + 2) % 4]);
  px(ctx, L + 3, B - 23, 10, 7, "#1d1426");
  for (let i = 0; i < 4; i++) px(ctx, L + 4 + i * 2, B - 22, 1, 5, i === k % 4 ? "#ffd25a" : "#6a5a80");
  px(ctx, L + 3, B - 15, 10, 1, "#c9962a");
  px(ctx, L + 3, B - 13, 10, 8, "#2a1d24");
  for (let y = B - 12; y < B - 5; y += 2) px(ctx, L + 4, y, 8, 1, "#4a3540");
  px(ctx, L + 1, B - 3, 14, 3, "#3a1d24");
}

function frame(ctx: Ctx, L: number, B: number, bg: string) {
  px(ctx, L, B - 12, 9, 12, LINE);
  px(ctx, L + 1, B - 11, 7, 10, bg);
}

function posterHills(ctx: Ctx, L: number, B: number) {
  frame(ctx, L, B, "#7fc4ec");
  px(ctx, L + 5, B - 10, 2, 2, "#ffd25a");
  px(ctx, L + 1, B - 6, 7, 5, "#3e5a7a");
  px(ctx, L + 2, B - 7, 2, 1, "#3e5a7a");
  px(ctx, L + 3, B - 8, 1, 1, "#e9f2ea");
  px(ctx, L + 5, B - 6, 2, 1, "#e9f2ea");
  px(ctx, L + 1, B - 3, 7, 2, "#2f7a4b");
}

function posterCat(ctx: Ctx, L: number, B: number) {
  frame(ctx, L, B, "#ff9ab8");
  px(ctx, L + 2, B - 9, 1, 2, "#e8913a");
  px(ctx, L + 6, B - 9, 1, 2, "#e8913a");
  px(ctx, L + 2, B - 8, 5, 5, "#e8913a");
  px(ctx, L + 3, B - 7, 1, 1, LINE);
  px(ctx, L + 5, B - 7, 1, 1, LINE);
  px(ctx, L + 4, B - 5, 1, 1, "#ff6b9a");
  px(ctx, L + 2, B - 2, 5, 1, "#ffe0f0");
}

function posterRocket(ctx: Ctx, L: number, B: number, t: number) {
  frame(ctx, L, B, "#1d1426");
  px(ctx, L + 2, B - 10, 1, 1, "#ffffff");
  px(ctx, L + 6, B - 8, 1, 1, "#ffffff");
  px(ctx, L + 4, B - 10, 1, 1, "#f4efe6");
  px(ctx, L + 3, B - 9, 3, 5, "#f4efe6");
  px(ctx, L + 4, B - 8, 1, 1, "#5aa9e6");
  px(ctx, L + 2, B - 5, 1, 2, "#d63a3a");
  px(ctx, L + 6, B - 5, 1, 2, "#d63a3a");
  px(ctx, L + 4, B - 4, 1, 1 + (Math.floor(t * 6) % 2), "#ff9a3c");
}

function rug(ctx: Ctx, L: number, B: number) {
  px(ctx, L + 1, B - 9, 26, 9, "#5a2430");
  px(ctx, L, B - 8, 28, 7, "#5a2430");
  px(ctx, L + 2, B - 8, 24, 7, "#7a2d3a");
  px(ctx, L + 3, B - 7, 22, 1, "#d9a978");
  px(ctx, L + 3, B - 3, 22, 1, "#d9a978");
  for (let x = L + 5; x < L + 24; x += 4) px(ctx, x, B - 5, 2, 1, (x - L) % 8 === 1 ? "#ffd25a" : "#c4744d");
  for (const y of [B - 8, B - 6, B - 4]) {
    px(ctx, L - 1, y, 1, 1, "#d9a978");
    px(ctx, L + 28, y, 1, 1, "#d9a978");
  }
}

function neon(ctx: Ctx, L: number, B: number, t: number) {
  px(ctx, L, B - 10, 22, 10, LINE);
  px(ctx, L + 1, B - 9, 20, 8, "#150f22");
  const on = Math.floor(t * 3) % 4 !== 0;
  for (let x = L + 3; x < L + 19; x += 2) px(ctx, x, B - 7, 1, 2, on ? "#ff4fa3" : "#7a2a52");
  for (let x = L + 4; x < L + 18; x += 2) px(ctx, x, B - 4, 1, 1, "#5ce1ff");
}

/** A café cat sitting still, in the given fur; the shop shows the second cat with it. */
export function sittingCat(ctx: Ctx, L: number, B: number, fur: string, dark: string, belly: string) {
  px(ctx, L + 2, B - 6, 8, 6, LINE);
  px(ctx, L + 3, B - 5, 6, 5, fur);
  px(ctx, L + 3, B - 3, 6, 1, dark);
  px(ctx, L + 6, B - 2, 3, 1, belly);
  px(ctx, L + 8, B - 9, 5, 5, LINE);
  px(ctx, L + 9, B - 8, 3, 3, fur);
  px(ctx, L + 9, B - 10, 1, 2, fur);
  px(ctx, L + 11, B - 10, 1, 2, fur);
  px(ctx, L + 11, B - 7, 1, 1, LINE);
  px(ctx, L, B - 4, 2, 1, dark);
  px(ctx, L - 1, B - 5, 1, 2, dark);
}

export const CAT2 = { fur: "#9aa0ad", dark: "#5f6370", belly: "#e3e6ee" } as const;

const DRAW: Record<ItemId, Draw> = {
  candle,
  cactus,
  luckycat,
  bonsai,
  posterHills,
  posterCat,
  posterRocket,
  rug,
  catbed,
  lamp,
  palm,
  shelf,
  gramophone,
  couch,
  jukebox,
  neon,
  cat2: (ctx, L, B) => sittingCat(ctx, L + 1, B, CAT2.fur, CAT2.dark, CAT2.belly),
  arcade: (ctx, L, B, t) => drawArcade(ctx, t, L, B),
  aquarium: (ctx, L, B, t) => drawAquarium(ctx, t, L, B),
  plant: (ctx, L, B) => drawPlant(ctx, L + 7, B),
  owl: (ctx, L, B, t) => drawOwl(ctx, t, L, B),
  ...RARE_DRAW,
};

/** One piece of furniture with its foot in the middle of `cx` at `bottom`. */
export function drawItem(ctx: Ctx, id: ItemId, w: number, cx: number, bottom: number, t: number) {
  DRAW[id](ctx, Math.round(cx - w / 2), Math.round(bottom), t);
}

/** The light the warm pieces give off, drawn after the room is dimmed. */
export function itemLight(ctx: Ctx, id: ItemId, cx: number, bottom: number, t: number) {
  if (rareLight(ctx, id, cx, bottom, t)) return;
  if (id === "candle") glow(ctx, cx, bottom - 9, 7, "#ffb15e", 0.16 + (Math.floor(t * 7) % 3) * 0.02);
  else if (id === "lamp") glow(ctx, cx, bottom - 20, 18, "#ffd9a0", 0.16);
  else if (id === "jukebox") glow(ctx, cx, bottom - 16, 16, JUKE[Math.floor(t * 2) % 4], 0.12);
  else if (id === "arcade") glow(ctx, cx, bottom - 19, 14, "#5ce1ff", 0.16);
  else if (id === "aquarium") glow(ctx, cx, bottom - 16, 14, "#5ab0e0", 0.14);
  else if (id === "owl") glow(ctx, cx, bottom - 7, 6, "#ffd25a", 0.12);
}
