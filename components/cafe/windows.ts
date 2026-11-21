import { Ctx, LINE, px, rand } from "./pixel";
import type { Fixtures } from "./room";
import { Phase, Theme } from "./theme";

const IY = 7;
const IH = 25;

const BUILDINGS: Record<Phase, [string, string]> = {
  night: ["#0a0c20", "#0d1029"],
  dawn: ["#2a2748", "#322d55"],
  day: ["#43567a", "#4f6388"],
  dusk: ["#221f40", "#2a2549"],
};
/** how many windows are lit, as the share left dark */
const DARK: Record<Phase, number> = { night: 0.62, dusk: 0.66, dawn: 0.84, day: 0.55 };
const PINES: Record<Phase, [string, string]> = {
  night: ["#07120d", "#0a1a12"],
  dawn: ["#132219", "#182a1f"],
  day: ["#2e5a3a", "#386b45"],
  dusk: ["#0f1d15", "#14251b"],
};

function city(ctx: Ctx, ix: number, iw: number, seed: number, th: Theme) {
  const light = th.light ?? "night";
  const [b0, b1] = BUILDINGS[light];
  for (let bx = ix, b = 0; bx < ix + iw; b++) {
    const bw = Math.min(5 + Math.floor(rand(seed * 31 + b) * 7), ix + iw - bx);
    const bh = 7 + Math.floor(rand(seed * 17 + b * 3) * 12);
    const top = IY + IH - bh;
    px(ctx, bx, top, bw, bh, b % 2 ? b0 : b1);
    for (let wy = top + 2; wy < IY + IH - 1; wy += 3) {
      for (let wx = bx + 1; wx < bx + bw - 1; wx += 2) {
        if (rand(wx * 3.1 + wy * 7.7 + seed) <= DARK[light]) continue;
        const r = rand(wx + wy);
        const glass = light === "day" ? (r > 0.5 ? "#9db6d4" : "#7f97b8") : r > 0.8 ? "#7fd4ff" : "#ffd27a";
        px(ctx, wx, wy, 1, 1, glass);
      }
    }
    if (th.snowCaps) px(ctx, bx, top, bw, 1, "#e6ecff");
    bx += bw;
  }
}

function disc(ctx: Ctx, cx: number, cy: number, r: number, clip: [number, number, number, number], color: (dx: number, dy: number) => string) {
  const [x0, y0, x1, y1] = clip;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < x0 || x >= x1 || y < y0 || y >= y1 || dx * dx + dy * dy > r * r) continue;
      px(ctx, x, y, 1, 1, color(dx, dy));
    }
  }
}

function planet(ctx: Ctx, ix: number, iw: number, seed: number) {
  const clip: [number, number, number, number] = [ix, IY, ix + iw, IY + IH];
  if (seed % 2 === 0) {
    const cx = ix + Math.round(iw * 0.66);
    const cy = IY + IH + 8;
    disc(ctx, cx, cy, 17, clip, (dx, dy) => (Math.floor((dy + dx * 0.3) / 3) % 2 ? "#5b46b8" : "#7a5cff"));
    for (let k = -24; k <= 24; k++) {
      const x = cx + k;
      const y = cy - 12 + Math.round(k * 0.18);
      if (x >= ix && x < ix + iw && y >= IY && y < IY + IH) px(ctx, x, y, 1, 1, "#ffd9a8");
    }
    return;
  }
  const cx = ix + 6 + Math.floor(rand(seed * 5) * (iw - 12));
  disc(ctx, cx, IY + 9, 4, clip, (dx, dy) => (dx + dy < 0 ? "#ff9a62" : "#b8642a"));
  for (let k = 0; k < 10; k++) px(ctx, ix + Math.floor(rand(seed * 90 + k) * iw), IY + 14 + Math.floor(rand(seed * 40 + k) * 10), 1, 1, "#3a2f6b");
}

function pines(ctx: Ctx, ix: number, iw: number, seed: number, light: Phase) {
  const [p0, p1] = PINES[light];
  for (let bx = ix - 3, b = 0; bx < ix + iw; b++) {
    const h = 9 + Math.floor(rand(seed * 23 + b) * 9);
    const c = b % 2 ? p0 : p1;
    for (let r = 0; r < h; r++) {
      const half = Math.floor(r / 2.4);
      for (let x = bx - half; x <= bx + half; x++) if (x >= ix && x < ix + iw) px(ctx, x, IY + IH - h + r, 1, 1, c);
    }
    bx += 5 + Math.floor(rand(seed * 11 + b) * 5);
  }
}

const HILL = ["#2b1438", "#150a1e"];
const PUMPKIN = "#e8761e";
const CANDLE = "#ffd25a";
/** a bare tree's twigs, from the foot of its trunk */
const BRANCHES = [[-1, -7], [-2, -8], [-3, -9], [-2, -10], [1, -5], [2, -6], [3, -7], [3, -8], [1, -11], [-1, -11]];

/** A far and a near hill, a bare tree, gravestones and lit pumpkins, and on every other window a crooked house. */
function spooky(ctx: Ctx, ix: number, iw: number, seed: number) {
  const bottom = IY + IH;
  const hill = (x: number, k: number, base: number, amp: number) =>
    base + Math.round(amp * Math.sin((x + seed * 29) * k) + amp * 0.6 * Math.sin((x + seed * 11) * k * 2.3));
  const ground = (x: number) => bottom - hill(x, 0.14, 5, 1.6);
  for (let x = ix; x < ix + iw; x++) {
    const far = hill(x, 0.09, 9, 2.5);
    px(ctx, x, bottom - far, 1, far, HILL[0]);
    px(ctx, x, ground(x), 1, bottom - ground(x), HILL[1]);
  }
  const tx = ix + 4 + Math.floor(rand(seed * 41) * (iw - 8));
  const g = ground(tx);
  px(ctx, tx, g - 10, 1, 10, HILL[1]);
  for (const [dx, dy] of BRANCHES) px(ctx, tx + dx, g + dy, 1, 1, HILL[1]);
  if (seed % 2 === 1) {
    const hx = tx > ix + iw / 2 ? ix + 3 : ix + iw - 10;
    const hg = ground(hx + 3);
    px(ctx, hx, hg - 6, 7, 6, HILL[1]);
    px(ctx, hx + 1, hg - 7, 6, 1, HILL[1]);
    px(ctx, hx + 2, hg - 8, 4, 1, HILL[1]);
    px(ctx, hx + 4, hg - 9, 1, 1, HILL[1]);
    px(ctx, hx + 1, hg - 9, 1, 2, HILL[1]);
    px(ctx, hx + 2, hg - 4, 1, 1, CANDLE);
    px(ctx, hx + 5, hg - 5, 1, 1, "#ff9a3c");
  }
  for (let k = 0; k < 2; k++) {
    const x = ix + 2 + Math.floor(rand(seed * 53 + k * 7) * (iw - 5));
    const y = ground(x + 1);
    if (k === 0) {
      px(ctx, x, y - 3, 2, 3, "#4a3d58");
      px(ctx, x, y - 3, 2, 1, "#5e4f6e");
    } else {
      px(ctx, x + 1, y - 4, 1, 4, "#4a3d58");
      px(ctx, x, y - 3, 3, 1, "#4a3d58");
    }
  }
  for (let k = 0; k < 2; k++) {
    const x = ix + 1 + Math.floor(rand(seed * 67 + k * 5) * (iw - 4));
    const y = ground(x + 1);
    px(ctx, x, y - 2, 3, 2, PUMPKIN);
    px(ctx, x + 1, y - 3, 1, 1, "#3e7a3a");
    px(ctx, x + 1, y - 2, 1, 1, CANDLE);
  }
}

/** The Halloween moon: big, low and orange, whatever the hour. */
function orangeMoon(ctx: Ctx, ix: number, iw: number) {
  disc(ctx, ix + 12, IY + 7, 5, [ix, IY, ix + iw, IY + IH], (dx, dy) => (dx + dy > 3 ? "#e8913a" : "#ffb347"));
  px(ctx, ix + 10, IY + 5, 2, 1, "#e8913a");
  px(ctx, ix + 14, IY + 9, 1, 1, "#e8913a");
  px(ctx, ix + 9, IY + 8, 1, 1, "#ffd08a");
}

/** The moon at night, the sun by day, and a low red sun at dawn and dusk, sinking behind the skyline. */
function drawSkyLight(ctx: Ctx, ix: number, light: Phase) {
  if (light === "night") {
    px(ctx, ix + 7, IY + 3, 4, 4, "#f4ecc8");
    px(ctx, ix + 8, IY + 4, 1, 1, "#d8cfa4");
    return;
  }
  const low = light !== "day";
  const x = ix + (light === "dusk" ? 14 : 6);
  const y = low ? IY + 13 : IY + 2;
  const [rim, core] = low ? ["#ff7a4a", "#ffc070"] : ["#ffd84a", "#fff3b0"];
  px(ctx, x, y + 1, 6, 4, rim);
  px(ctx, x + 1, y, 4, 6, rim);
  px(ctx, x + 1, y + 1, 4, 4, core);
}

/** A window onto the theme's outside: city, open space or forest, with the static part of the sky. */
export function drawWindow(ctx: Ctx, x: number, w: number, seed: number, th: Theme) {
  px(ctx, x - 1, 4, w + 2, 31, LINE);
  px(ctx, x, 5, w, 29, th.frame);
  const ix = x + 2;
  const iw = w - 4;
  th.sky.forEach((c, k) => px(ctx, ix, IY + k * 5, iw, 5, c));
  const light = th.light ?? "night";
  const planetary = th.skyline === "planet";
  const halloween = th.skyline === "spooky";
  const stars = planetary ? 16 : light === "night" || halloween ? 6 : 0;
  const band = planetary ? 22 : 10;
  for (let k = 0; k < stars; k++)
    px(ctx, ix + Math.floor(rand(seed * 50 + k) * iw), IY + Math.floor(rand(seed * 70 + k) * band), 1, 1, th.stars);
  if (seed === 0 && halloween) orangeMoon(ctx, ix, iw);
  else if (seed === 0 && !planetary) drawSkyLight(ctx, ix, light);
  if (th.skyline === "city") city(ctx, ix, iw, seed, th);
  else if (planetary) planet(ctx, ix, iw, seed);
  else if (halloween) spooky(ctx, ix, iw, seed);
  else pines(ctx, ix, iw, seed, light);
  if (th.skyline !== "planet") {
    px(ctx, x + w / 2 - 1, IY, 2, IH, th.frame);
    px(ctx, ix, IY + 12, iw, 1, th.frame);
  }
  px(ctx, x - 2, 33, w + 4, 2, th.sill);
  px(ctx, x - 2, 35, w + 4, 1, th.sillShadow);
}

/** A bat a few pixels wide, its wings up or down, cut to the glass it flies behind. */
function bat(ctx: Ctx, x: number, y: number, up: boolean, c: string, ix: number, iw: number) {
  const wing = up ? -1 : 1;
  for (const [dx, dy] of [[-2, wing], [2, wing], [-1, 0], [0, 0], [1, 0], [0, 1]]) {
    if (x + dx >= ix && x + dx < ix + iw) px(ctx, x + dx, y + dy, 1, 1, c);
  }
}

/** What moves behind the glass: rain, drifting stars, fireflies, snow or bats. */
export function drawWeather(ctx: Ctx, t: number, fx: Fixtures, th: Theme) {
  const c = th.weatherColor;
  fx.WINDOWS.forEach((w, wi) => {
    const ix = w.x + 2;
    const iw = w.w - 4;
    const ih = 23;
    if (th.weather === "rain") {
      ctx.globalAlpha = 0.5;
      for (let k = 0; k < 12; k++) {
        const y = (t * (22 + rand(k + wi * 20) * 10) + rand(k * 7 + wi) * ih) % ih;
        px(ctx, ix + Math.floor(rand(k * 13 + wi * 3) * iw), IY + y, 1, 2, c);
      }
    } else if (th.weather === "drift") {
      for (let k = 0; k < 7; k++) {
        const x = (((rand(k * 13 + wi * 3) * iw - t * (1.5 + rand(k + wi) * 2.5)) % iw) + iw) % iw;
        ctx.globalAlpha = 0.45 + 0.45 * Math.sin(t * 2 + k);
        px(ctx, ix + Math.floor(x), IY + Math.floor(rand(k * 7 + wi) * 18), 1, 1, c);
      }
    } else if (th.weather === "fireflies") {
      for (let k = 0; k < 5; k++) {
        const p = t * 0.4 + k * 1.7 + wi;
        const x = ix + 2 + ((rand(k * 13 + wi) * (iw - 4) + Math.sin(p) * 5 + iw) % (iw - 4));
        const y = IY + 8 + rand(k * 7 + wi) * 12 + Math.cos(p * 1.3) * 3;
        ctx.globalAlpha = Math.max(0, Math.sin(t * 2.2 + k * 2));
        px(ctx, x, y, 1, 1, c);
      }
    } else if (th.weather === "bats") {
      for (let k = 0; k < 3; k++) {
        const way = k % 2 ? 1 : -1;
        const span = iw + 8;
        const x = ((((rand(k * 13 + wi * 3) * span + t * (5 + rand(k * 5 + wi) * 6) * way) % span) + span) % span) - 4;
        const y = IY + 2 + Math.floor(rand(k * 7 + wi) * 10 + Math.sin(t * 2.5 + k * 2) * 2);
        bat(ctx, ix + Math.round(x), y, Math.floor(t * 9 + k * 3) % 2 === 0, c, ix, iw);
      }
    } else {
      ctx.globalAlpha = 0.85;
      for (let k = 0; k < 14; k++) {
        const y = (t * (5 + rand(k + wi * 20) * 4) + rand(k * 7 + wi) * ih) % ih;
        const x = (rand(k * 13 + wi * 3) * iw + Math.sin(t * 0.9 + k) * 2 + iw) % iw;
        px(ctx, ix + Math.floor(x), IY + y, 1, 1, c);
      }
    }
    ctx.globalAlpha = 1;
  });
}
