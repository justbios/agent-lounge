import { Theme } from "../theme";
import { Ctx } from "../pixel";
import { StreetLayout, StreetSeat, StreetWin } from "./geom";
import { INK, NEON_FONT, bay, bricks, clipped, mix, pen, stream } from "./px";
import { chair, desk, monitorOff } from "./seat";

/** Everything of the street that does not move, painted once per size, theme, hour and open or closed. */
export interface StreetArt {
  /** sky, houses, the facade, the empty rooms behind the glass, the pavement */
  bg: HTMLCanvasElement;
  /** over the people: reflections and drops on the glass, the mullions */
  glass: HTMLCanvasElement;
  /** over the pavement's reflection: light spilling from the windows, wet slab joints, puddle rims */
  wet: HTMLCanvasElement | null;
  /** last of all: the vignette */
  front: HTMLCanvasElement;
  /** the pixels of the neon's letter that buzzes */
  buzz: [number, number][];
  /** 1 at night, less by day: how strongly lamps, monitors and windows glow */
  lit: number;
  wetStreet: boolean;
  /** the weather falling past: rain, snow, fireflies, drifting stars or bats; none by day */
  weather: Theme["weather"] | null;
  interior: Interior;
}

export interface Interior {
  paper: string;
  stripe: string;
  dot: string;
  rail: string;
  wainscot: string;
  panel: string;
  panelTop: string;
  floor: string;
  floorLine: string;
  light: string;
  bulbs: [string, string];
}

const WARM: Interior = {
  paper: "#8a4a2e",
  stripe: "#9a5634",
  dot: "#a8643a",
  rail: "#c98a52",
  wainscot: "#5a2e20",
  panel: "#64341f",
  panelTop: "#7a4428",
  floor: "#4a2418",
  floorLine: "#3a1a12",
  light: "#ffcf86",
  bulbs: ["#ffe4a0", "#ffb070"],
};
const SPOOKY: Interior = {
  paper: "#4e2a56",
  stripe: "#5a3264",
  dot: "#6e3e78",
  rail: "#c0782e",
  wainscot: "#3a1a34",
  panel: "#44203e",
  panelTop: "#5a2c50",
  floor: "#2e1426",
  floorLine: "#24101e",
  light: "#c58cff",
  bulbs: ["#ffb347", "#b07aff"],
};

const NIGHT_SKY = ["#090a1c", "#0e1028", "#151736", "#1e1d45", "#2b2554", "#3a2c5c"];
const LIT = { night: 1, dusk: 0.9, dawn: 0.75, day: 0.35 } as const;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function buildStreet(lay: StreetLayout, th: Theme, open: boolean, brand: boolean): StreetArt {
  const W = lay.width;
  const H = lay.height;
  const U = lay.U;
  const phase = th.light ?? "night";
  const lit = LIT[phase];
  const night = phase === "night";
  const wetStreet = (night || phase === "dusk") && th.weather !== "snow";
  const weather = night || (phase === "dusk" && th.weather !== "rain") ? th.weather : null;
  const spooky = th.id === "halloween";
  const inside = spooky ? SPOOKY : WARM;
  const [bg, g] = canvas(W, H);
  const { P, A, line, ring, glow } = pen(g);
  const r = stream(7331 + W * 13 + U);

  // ---------- sky ----------
  const sky = th.id === "cafe" && night ? NIGHT_SKY : th.sky;
  for (let y = 0; y < 26; y++)
    for (let x = 0; x < W; x++) {
      const t = (y / 26) * (sky.length - 1) + bay(x, y) - 0.5;
      P(x, y, 1, 1, sky[Math.max(0, Math.min(sky.length - 1, Math.round(t)))]);
    }
  if (night || phase === "dusk") for (let k = 0; k < 26; k++) A(Math.floor(r() * W), Math.floor(r() * 14), 1, 1, th.stars, 0.35 + r() * 0.5);
  const mx = W - 38;
  if (spooky) {
    glow(mx, 9, 16, 12, "#ff9a3a", 0.3, 3);
    P(mx - 4, 4, 9, 10, "#ffb347");
    P(mx - 5, 6, 11, 6, "#ffb347");
    P(mx - 2, 6, 2, 2, "#e08a2a");
    P(mx + 2, 10, 2, 1, "#e08a2a");
  } else if (night) {
    glow(mx, 8, 14, 10, "#b9b6e8", 0.22, 3);
    P(mx - 3, 5, 6, 6, "#e9e2c8");
    P(mx - 4, 6, 1, 4, "#e9e2c8");
    P(mx + 3, 6, 1, 4, "#e9e2c8");
    P(mx - 2, 4, 4, 1, "#e9e2c8");
    P(mx - 2, 11, 4, 1, "#c9c0a8");
    P(mx - 1, 7, 1, 1, "#c9c0a8");
    P(mx + 1, 9, 2, 1, "#c9c0a8");
  } else if (phase === "day") {
    glow(mx, 8, 16, 12, "#fff6c0", 0.35, 3);
    P(mx - 3, 5, 7, 7, "#fff3b0");
    P(mx - 4, 6, 9, 5, "#fff3b0");
  }
  if (th.skyline === "planet") {
    P(44, 5, 12, 12, "#3a2c6a");
    P(43, 7, 14, 8, "#3a2c6a");
    P(45, 6, 5, 3, "#5a4a9a");
    line(36, 13, 64, 9, "#8a7ac8");
  }
  const cloud = night ? "#3a3768" : mix(sky[1], "#ffffff", 0.35);
  for (const c of [[40, 6, 40, 3], [W * 0.61, 4, 54, 3], [W * 0.82, 13, 44, 2]])
    for (let y = c[1]; y < c[1] + c[3]; y++)
      for (let x = Math.round(c[0]); x < c[0] + c[2]; x++)
        if (bay(x, y) < 0.55 - Math.abs(x - c[0] - c[2] / 2) / c[2]) A(x, y, 1, 1, cloud, 0.6);
  // far skyline: city blocks, or fir trees round the forest camp
  const far = night ? "#1a1838" : mix("#1a1838", sky[sky.length - 1], 0.45);
  const near = night ? "#121230" : mix("#121230", sky[sky.length - 1], 0.35);
  if (th.skyline === "pines") {
    for (let x = -4; x < W; x += 7 + Math.floor(r() * 6)) {
      const h = 8 + Math.floor(r() * 12);
      for (let k = 0; k < h; k++) P(x - Math.floor(k / 2.2), 26 - h + k, 1 + Math.floor((k / 2.2) * 2), 1, k % 3 ? near : far);
    }
  } else {
    let bx = -4;
    while (bx < W) {
      const bw = 10 + Math.floor(r() * 16);
      const bh = 6 + Math.floor(r() * 14);
      P(bx, 26 - bh, bw, bh, far);
      if (r() < 0.3) P(bx + 3, 26 - bh - 3, 1, 3, far);
      if (th.snowCaps) P(bx, 26 - bh, bw, 1, "#dfe6ff");
      bx += bw;
    }
    bx = -2;
    while (bx < W) {
      const bw = 12 + Math.floor(r() * 14);
      const bh = 4 + Math.floor(r() * 12);
      P(bx, 26 - bh, bw, bh, near);
      for (let wy = 26 - bh + 2; wy < 25; wy += 3)
        for (let wx = bx + 2; wx < bx + bw - 1; wx += 3)
          if (r() < 0.28 && phase !== "day") P(wx, wy, 1, 1, r() < 0.75 ? "#c9a46a" : "#7d8ad0");
      bx += bw + 1;
    }
  }

  // ---------- the houses either side ----------
  const sideHouse = (x0: number, w: number, top: number, left: boolean) => {
    if (w <= 0) return;
    bricks(g, r, x0, top, w, 150 + U - top, "#251d33", "#17121f", 0.08);
    A(x0, top, w, 150 + U - top, "#06050c", 0.35);
    P(x0, top - 1, w, 2, "#2e2740");
    if (w < 30) return;
    // a few windows up the wall, some lit, and a shop shuttered for the night at street level
    for (let y = top + 10; y < 104 + U - 22; y += 24)
      for (let x = x0 + 8; x + 12 < x0 + w - 4; x += 22) {
        P(x - 1, y - 1, 14, 16, INK);
        const on = r() < 0.3 && phase !== "day";
        P(x, y, 12, 14, on ? "#7a4a2a" : "#161b36");
        if (on) glow(x + 6, y + 9, 8, 8, "#ffc27a", 0.35 * lit, 3);
        else for (let k = 0; k < 14; k++) if ((k + x) % 9 < 2) P(x + (k % 12), y + k, 1, 1, "#2a3260");
        P(x + 6, y, 1, 14, "#1e1828");
        P(x - 2, y + 15, 16, 1, "#3a3650");
      }
    const sx = left ? x0 + 6 : x0 + 6;
    const sw = w - 12;
    if (sw > 20) {
      P(sx - 1, 106 + U, sw + 2, 38, INK);
      for (let y = 107 + U; y < 143 + U; y += 2) P(sx, y, sw, 1, y % 4 ? "#3a3d58" : "#2c2e46");
      P(sx, 104 + U, sw, 3, "#1c1a2c");
      glow(sx + sw / 2, 100 + U, 8, 4, "#bfe6ff", 0.25 * lit, 2);
    }
  };
  sideHouse(0, lay.fx0, 14, true);
  sideHouse(lay.fx1, W - lay.fx1, 18, false);

  // ---------- the café's facade ----------
  const fw = lay.fx1 - lay.fx0;
  bricks(g, r, lay.fx0, 26, fw, 124 + U, "#43293f", "#251828", 0.09);
  P(lay.fx0 - 2, 20, fw + 4, 6, "#2a2238");
  P(lay.fx0 - 2, 20, fw + 4, 1, th.snowCaps ? "#eef3ff" : "#57507e");
  if (th.snowCaps) P(lay.fx0 - 2, 19, fw + 4, 1, "#dfe6ff");
  P(lay.fx0 - 2, 25, fw + 4, 1, INK);
  for (let x = lay.fx0; x < lay.fx1; x += 4) P(x, 23, 2, 2, "#1c1628");
  P(lay.fx0 - 3, 19 - (th.snowCaps ? 1 : 0), fw + 6, 1, INK);
  // water tank and an aerial with its red light
  const tk = lay.fx0 + 42;
  P(tk, 4, 16, 12, "#1b1630");
  P(tk, 4, 16, 1, "#3c3566");
  P(tk - 1, 3, 18, 1, INK);
  for (let y = 6; y < 16; y += 3) P(tk, y, 16, 1, "#141024");
  P(tk + 2, 16, 1, 4, "#1b1630");
  P(tk + 13, 16, 1, 4, "#1b1630");
  line(tk + 2, 16, tk + 13, 19, "#1b1630");
  const ae = lay.fx1 - 52;
  if (ae > tk + 30) {
    P(ae, 2, 1, 18, "#1b1630");
    P(ae - 4, 6, 9, 1, "#1b1630");
    P(ae - 3, 10, 7, 1, "#1b1630");
    P(ae, 1, 1, 1, "#ff4d5e");
    glow(ae, 1, 4, 3, "#ff4d5e", 0.4, 2);
  }
  // drainpipe
  const dp = lay.fx0 + 6;
  P(dp, 26, 2, 124 + U, "#1f1a2e");
  P(dp, 26, 1, 124 + U, "#3d3658");
  for (let y = 40; y < 150 + U; y += 26) P(dp - 1, y, 4, 1, "#151020");

  // little windows under the roof: dark, and one with a lamp and a plant
  const attic = fw > 200 ? [0.11, 0.46, 0.68, 0.85] : [0.18, 0.72];
  attic.forEach((f, k) => {
    const x = Math.round(lay.fx0 + fw * f - 12);
    upWin(x, 31, 24, 20, k === attic.length - 2 && phase !== "day");
  });
  function upWin(x: number, y: number, w: number, h: number, on: boolean) {
    P(x - 2, y - 2, w + 4, h + 4, INK);
    P(x - 1, y - 1, w + 2, h + 2, "#2c2440");
    if (on) {
      P(x, y, w, h, "#7a3e28");
      glow(x + w / 2, y + h * 0.7, w * 0.7, h * 0.8, "#ffc27a", 0.5 * lit, 3);
      for (let yy = y; yy < y + h * 0.55; yy += 2) {
        P(x, yy, w, 1, "#c98a52");
        P(x, yy + 1, w, 1, "#8a5232");
      }
      P(x + 3, y + h - 6, 4, 5, "#2a1a18");
      P(x + 2, y + h - 9, 2, 3, "#2a3a24");
      P(x + 5, y + h - 10, 2, 4, "#2a3a24");
      P(x + 6, y + h - 8, 2, 2, "#2a3a24");
    } else {
      P(x, y, w, h, phase === "day" ? "#3a4a7a" : "#161b36");
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) if ((xx - yy * 0.7 + 200) % 22 < 2) A(xx, yy, 1, 1, "#6f7ab8", 0.35);
      P(x, y, 3, h, "#2a2548");
      P(x + w - 3, y, 3, h, "#2a2548");
    }
    P(x + Math.floor(w / 2), y, 1, h, "#2c2440");
    P(x, y + Math.floor(h / 2), w, 1, "#2c2440");
    P(x - 3, y + h + 2, w + 6, 2, th.snowCaps ? "#e6ecff" : "#5a5878");
    P(x - 3, y + h + 4, w + 6, 1, INK);
  }

  // ---------- the neon sign ----------
  const S = lay.sign;
  const buzz: [number, number][] = [];
  if (open) glow(S.x + S.w / 2, S.y + 9, 96, 26, "#ff4f9a", 0.32 * lit, 5);
  P(S.x, S.y, S.w, S.h, INK);
  P(S.x + 1, S.y + 1, S.w - 2, S.h - 2, "#1a1226");
  P(S.x + 1, S.y + 1, S.w - 2, 1, "#3a2a4a");
  for (const bx of [S.x + 3, S.x + S.w - 4]) {
    P(bx, S.y + 3, 1, 1, "#6a5a7a");
    P(bx, S.y + 13, 1, 1, "#6a5a7a");
  }
  if (brand) {
    let tx = S.x + 6;
    const pts: [number, number, string][] = [];
    for (const ch of "AGENT LOUNGE") {
      const f = NEON_FONT[ch];
      if (f) for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (f[j][i] === "X") pts.push([tx + i, S.y + 3 + j, ch]);
      tx += ch === " " ? 4 : 6;
    }
    if (open) {
      g.globalAlpha = 0.55 * Math.max(0.5, lit);
      g.fillStyle = "#ff3d8f";
      for (const p of pts) {
        g.fillRect(p[0] - 1, p[1], 3, 1);
        g.fillRect(p[0], p[1] - 1, 1, 3);
      }
      g.globalAlpha = 1;
    }
    let u = 0;
    let uAt = -1;
    pts.forEach((p, k) => {
      if (p[2] === "U" && (k === 0 || pts[k - 1][2] !== "U")) u++;
      if (u === 2 && uAt < 0 && p[2] === "U") uAt = k;
    });
    pts.forEach((p, k) => {
      const second = p[2] === "U" && k >= uAt && uAt >= 0 && pts.slice(uAt, k + 1).every((q) => q[2] === "U");
      if (second) buzz.push([p[0], p[1]]);
      P(p[0], p[1], 1, 1, open ? "#ffd3e7" : "#4a2a3a");
    });
  }
  P(S.x + 6, S.y + 12, S.w - 12, 1, open ? "#bff8ff" : "#2a3a44");
  if (open) A(S.x + 5, S.y + 11, S.w - 10, 3, "#62f0ff", 0.35 * lit);

  // ---------- warm light on the bricks around the windows ----------
  for (const w of lay.wins) glow(w.x + w.w / 2, w.y + 28, w.w * 0.78, 44, "#ff9d4f", 0.3 * lit * (open ? 1 : 0.4), 5);
  glow(lay.door.x + 16, lay.door.y + 32, 34, 40, "#ffb05e", 0.34 * lit * (open ? 1 : 0.3), 5);

  // ---------- the windows: frames, the rooms behind them, the sills ----------
  lay.wins.forEach((w, wi) => shopWindow(w, wi));
  function shopWindow(win: StreetWin, wi: number) {
    const { x: x0, y: y0, w, h } = win;
    P(x0 - 3, y0 - 3, w + 6, h + 5, INK);
    P(x0 - 2, y0 - 2, w + 4, h + 3, "#2a2236");
    P(x0 - 2, y0 - 2, w + 4, 1, "#4a4068");
    clipped(g, x0, y0, w, h, () => {
      P(x0, y0, w, 36, inside.paper);
      for (let x = x0 + 1; x < x0 + w; x += 5) P(x, y0, 1, 36, inside.stripe);
      for (let x = x0 + 3; x < x0 + w; x += 5) for (let y = y0 + 2; y < y0 + 36; y += 5) P(x, y, 1, 1, inside.dot);
      P(x0, y0 + 36, w, 1, inside.rail);
      P(x0, y0 + 37, w, 9, inside.wainscot);
      for (let x = x0 + 2; x < x0 + w; x += 9) {
        P(x, y0 + 38, 7, 7, inside.panel);
        P(x, y0 + 38, 7, 1, inside.panelTop);
      }
      P(x0, y0 + 46, w, 5, inside.floor);
      for (let x = x0; x < x0 + w; x += 6) P(x, y0 + 46, 1, 5, inside.floorLine);
      P(x0, y0 + 46, w, 1, "#2a120e");
      for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + w; x++) if (bay(x, y) * 8 > y - y0) A(x, y, 1, 1, "#2a1018", 0.55);
      backWall(x0, y0, w, wi);
      const hp = wi % 2 === 0 ? x0 + w - 9 : x0 + 2;
      if (w > 60) {
        P(hp + 3, y0, 1, 7, "#2a1a12");
        P(hp, y0 + 7, 7, 4, "#a0522d");
        P(hp, y0 + 7, 7, 1, "#c87a45");
        for (let k = 0; k < 9; k++) P(hp - 1 + Math.floor(r() * 9), y0 + 10 + Math.floor(r() * 8), 1, 2, k % 2 ? "#3e8a4a" : "#5aa85a");
      }
      glow(x0 + w / 2, y0 + 8, Math.min(74, w * 0.67), 40, inside.light, 0.34 * (open ? 1 : 0.35), 5);
      for (let x = x0; x < x0 + w; x++) {
        const sag = Math.round(Math.sin((((x - x0) % 37) / 37) * Math.PI) * 2);
        P(x, y0 + 5 + sag, 1, 1, "#2a1a18");
        if ((x - x0) % 6 === 3) {
          P(x, y0 + 6 + sag, 1, 1, open ? (x % 12 < 6 ? inside.bulbs[0] : inside.bulbs[1]) : "#4a3a30");
          if (open) glow(x, y0 + 7 + sag, 3, 2, "#ffd38a", 0.4, 2);
        }
      }
      lay.spare.filter((s) => s.win === wi).forEach((s) => spareSeat(s));
    });
    {
      P(x0 - 5, y0 + h + 1, w + 10, 3, th.snowCaps ? "#e6ecff" : "#5d5f80");
      P(x0 - 5, y0 + h + 1, w + 10, 1, th.snowCaps ? "#ffffff" : "#c9a07a");
      P(x0 - 5, y0 + h + 4, w + 10, 1, INK);
      for (let x = x0 - 5; x < x0 + w + 5; x++) if (bay(x, y0 + h + 2) < 0.4) A(x, y0 + h + 2, 1, 1, "#ffb070", 0.35 * lit);
    }
  }
  function spareSeat(s: StreetSeat) {
    const o = s.y0 - 88;
    glow(s.px + 22, 135 + o, 16, 3, "#ffb070", 0.12, 3);
    chair(g, s.px, o);
    desk(g, s.px, o);
    monitorOff(g, s.px, o);
  }
  function backWall(x0: number, y0: number, w: number, wi: number) {
    const k = wi % 4;
    if (k === 0 || k === 3) {
      P(x0 + 4, y0 + 22, 18, 1, "#4a2418");
      P(x0 + 4, y0 + 21, 18, 1, "#c98a52");
      for (const [dx, c] of [[6, "#e8e4da"], [10, "#ff6aa8"], [14, "#62f0ff"], [18, "#e8e4da"]] as const) {
        P(x0 + dx, y0 + 18, 3, 3, c);
        P(x0 + dx + 3, y0 + 19, 1, 1, c);
      }
      if (w > 60) {
        P(x0 + 44, y0 + 15, 10, 12, INK);
        P(x0 + 45, y0 + 16, 8, 10, "#2a3b5e");
        P(x0 + 46, y0 + 22, 6, 3, "#ff6aa8");
        P(x0 + 47, y0 + 17, 3, 3, "#ffd38a");
      }
      if (w > 96) {
        P(x0 + 82, y0 + 16, 12, 9, INK);
        P(x0 + 83, y0 + 17, 10, 7, "#1d3a2c");
        for (let q = 0; q < 3; q++) P(x0 + 84, y0 + 18 + q * 2, 4 + q * 2, 1, "#cfe8d8");
      }
    } else {
      P(x0 + 6, y0 + 15, 9, 9, INK);
      P(x0 + 7, y0 + 16, 7, 7, "#e8e0d0");
      P(x0 + 10, y0 + 17, 1, 3, "#231b30");
      P(x0 + 10, y0 + 19, 2, 1, "#c0392b");
      if (w > 66) {
        P(x0 + 43, y0 + 22, 22, 1, "#4a2418");
        P(x0 + 43, y0 + 21, 22, 1, "#c98a52");
        const books = ["#3a6ea8", "#d9485f", "#e8c060", "#4fb3a9", "#8a63d2", "#e8e4da"];
        for (let q = 0; q < 6; q++) P(x0 + 44 + q * 3, y0 + 14 + (q % 2), 2, 7 - (q % 2), books[q]);
      }
      if (w > 96) {
        P(x0 + 84, y0 + 14, 12, 10, INK);
        P(x0 + 85, y0 + 15, 10, 8, "#3a2050");
        P(x0 + 86, y0 + 16, 8, 2, "#ff6aa8");
        P(x0 + 86, y0 + 19, 5, 1, "#62f0ff");
        P(x0 + 86, y0 + 21, 7, 1, "#62f0ff");
      }
    }
  }

  // ---------- the door, the counter seen through it ----------
  const D = lay.door;
  const dx = D.x - 144;
  const dy = D.y - 86;
  P(144 + dx, 86 + dy, 33, 64, INK);
  P(145 + dx, 87 + dy, 31, 62, "#1d3a3c");
  P(145 + dx, 87 + dy, 31, 1, "#3c6a68");
  clipped(g, 148 + dx, 90 + dy, 25, 30, () => {
    P(148 + dx, 90 + dy, 25, 30, spooky ? "#5a3264" : "#9a5634");
    glow(160 + dx, 100 + dy, 22, 24, spooky ? "#d9a0ff" : "#ffd9a0", 0.55 * (open ? 1 : 0.3), 4);
    const jars = ["#3e8a4a", "#c87a45", "#e8e4da", "#8a63d2", "#d9485f", "#e8c060"];
    for (let k = 0; k < 6; k++) P(150 + dx + k * 4, 95 + dy, 2, 4, jars[k]);
    P(149 + dx, 99 + dy, 23, 1, "#4a2418");
    // the coffee machine
    P(165 + dx, 101 + dy, 6, 7, "#c9ccd8");
    P(165 + dx, 101 + dy, 6, 1, "#ffffff");
    P(167 + dx, 108 + dy, 2, 1, "#2a2a3a");
  });
  P(147 + dx, 89 + dy, 27, 1, INK);
  P(147 + dx, 120 + dy, 27, 1, INK);
  P(147 + dx, 89 + dy, 1, 32, INK);
  P(173 + dx, 89 + dy, 1, 32, INK);
  P(149 + dx, 123 + dy, 23, 11, "#163032");
  P(149 + dx, 123 + dy, 23, 1, "#2c5654");
  P(149 + dx, 136 + dy, 23, 10, "#163032");
  P(149 + dx, 136 + dy, 23, 1, "#2c5654");
  P(170 + dx, 124 + dy, 2, 6, "#e0b86a");
  P(170 + dx, 124 + dy, 1, 1, "#fff0c0");
  P(150 + dx, 125 + dy, 5, 3, open ? "#ffc456" : "#6a5a4a");
  P(142 + dx, 148 + dy, 37, 3, "#5d5f80");
  P(142 + dx, 148 + dy, 37, 1, "#d9a878");
  if (open) {
    glow(160 + dx, 82 + dy, 10, 5, "#ffd38a", 0.5 * lit, 3);
    P(158 + dx, 82 + dy, 5, 2, "#ffe4a0");
  } else P(158 + dx, 82 + dy, 5, 2, "#4a4050");

  // plinth under the windows
  for (const [x, w] of [[lay.fx0, D.x - lay.fx0], [D.x + D.w, lay.fx1 - D.x - D.w]]) {
    if (w <= 0) continue;
    P(x, 144 + U, w, 6, "#2c2a40");
    for (let xx = x; xx < x + w; xx += 16) P(xx, 144 + U, 1, 6, "#1c1a2c");
    P(x, 144 + U, w, 1, "#45435e");
  }

  // ---------- the awning over the shop front ----------
  const a0 = lay.fx0 + 3;
  const a1 = lay.fx1 - 3;
  const ay = 73 + U;
  const red = spooky ? ["#5a2a6a", "#3a1848"] : ["#8c2f3c", "#5e1a2c"];
  const cream = spooky ? ["#e08a3a", "#a05a20"] : ["#cdb894", "#8f7c68"];
  P(a0 - 1, ay, a1 - a0 + 2, 1, INK);
  for (let x = a0; x < a1; x++) {
    const stripe = Math.floor((x - a0) / 8) % 2 === 0;
    const [base, dark] = stripe ? red : cream;
    for (let y = ay + 1; y < ay + 12; y++) P(x, y, 1, 1, y < ay + 4 ? dark : base);
    const sc = (x - a0) % 8;
    const dep = [1, 2, 2, 3, 3, 2, 2, 1][sc];
    P(x, ay + 12, 1, dep, base);
    P(x, ay + 12 + dep, 1, 1, INK);
    A(x, ay + 11, 1, dep + 1, "#ffb070", 0.18 * lit);
  }
  for (let x = a0; x < a1; x++) if (bay(x, ay + 1) < 0.5) A(x, ay + 1, 1, 1, th.snowCaps ? "#ffffff" : "#ff6aa8", th.snowCaps ? 0.9 : 0.35 * lit);
  A(a0, ay + 4, a1 - a0, 1, "#ffffff", 0.08);
  if (wetStreet) for (let x = a0 + 3; x < a1; x += 8) if (r() < 0.6) A(x, ay + 16 + Math.floor(r() * 6), 1, 1, "#bcd0ff", 0.7);

  // ---------- pavement and road ----------
  const G = lay.walk;
  const dryTint = phase === "day" ? 0.35 : phase === "night" ? 0 : 0.15;
  const slab = mix("#1b1e36", "#8a8aa0", dryTint);
  const seam = mix("#121427", "#5a5a72", dryTint);
  P(0, G, W, 17, slab);
  for (let y = G; y < G + 17; y += 8) P(0, y, W, 1, seam);
  for (let q = 0; q < 3; q++) for (let x = (q % 2) * 9; x < W; x += 18) P(x, G + q * 8, 1, 8, seam);
  P(0, G + 16, W, 1, "#56587a");
  P(0, G + 17, W, 2, mix("#2a2b44", "#6a6a80", dryTint));
  P(0, G + 19, W, H - G - 19, mix("#10122a", "#4a4a5e", dryTint));
  if (th.weather === "snow") for (let x = 0; x < W; x++) if (bay(x, G) < 0.6) P(x, G, 1, 1, "#e6ecff");
  if (wetStreet) {
    const streak = (xa: number, xb: number, col: string, a0: number) => {
      for (let y = G + 20; y < H; y++) {
        const t = (y - G - 20) / 10;
        let x = xa + Math.floor(r() * 3);
        while (x < xb) {
          const len = 2 + Math.floor(r() * 7);
          if (r() < 0.72 - t * 0.3) A(x, y, Math.min(len, xb - x), 1, col, a0 * (1 - t * 0.6) * (open ? 1 : 0.4));
          x += len + 1 + Math.floor(r() * 3);
        }
      }
    };
    for (const w of lay.wins.filter((q) => q.floor === 0)) streak(w.x + 8, w.x + w.w - 6, "#ffb060", 0.42);
    streak(D.x + 8, D.x + 26, "#ffd9a0", 0.55);
    streak(S.x + 8, S.x + S.w - 7, "#ff6aa8", 0.32);
    streak(lay.lampX - 14, lay.lampX - 6, "#d6f0ff", 0.6);
  }
  for (let x = 20; x < W; x += 40) P(x, H - 4, 14, 1, "#5a5a72");

  // ---------- a chalk sign on the pavement ----------
  const fx = lay.aframe.x;
  const fy = lay.aframe.y;
  line(fx, fy + 17, fx + 4, fy, "#4e2a1c");
  line(fx + 14, fy + 17, fx + 10, fy, "#4e2a1c");
  P(fx + 1, fy + 1, 12, 12, INK);
  P(fx + 2, fy + 2, 10, 10, "#1d3a2c");
  P(fx + 2, fy + 2, 10, 1, "#c87a45");
  P(fx + 4, fy + 4, 6, 1, "#cfe8d8");
  P(fx + 3, fy + 6, 4, 1, "#ffc456");
  P(fx + 8, fy + 6, 3, 1, "#cfe8d8");
  P(fx + 4, fy + 8, 5, 1, "#cfe8d8");
  P(fx + 5, fy + 10, 3, 1, "#ff6aa8");
  A(fx - 1, fy + 17, 18, 1, "#000000", 0.5);

  // ---------- a bike against the house next door ----------
  {
    const by = 159 + U;
    for (const wx of [7, 25]) {
      ring(wx, by, 6, "#0e0c18");
      ring(wx, by, 5, "#3c4466");
      ring(wx, by, 6.6, "#0e0c18");
      P(wx, by, 1, 1, "#9aa6c8");
      line(wx, by - 5, wx, by + 5, "#2a3048");
      line(wx - 5, by, wx + 5, by, "#2a3048");
    }
    const F = "#2f9f96";
    line(7, by, 14, by, F);
    line(14, by, 22, by - 7, F);
    line(12, by - 8, 14, by, F);
    line(12, by - 8, 22, by - 7, F);
    line(7, by, 12, by - 8, F);
    line(22, by - 7, 25, by, F);
    line(22, by - 7, 21, by - 10, F);
    P(19, by - 11, 5, 1, "#1a1a2a");
    P(10, by - 9, 5, 2, "#1a1a2a");
    P(13, by, 3, 1, "#9aa6c8");
    P(22, by - 10, 1, 1, "#ff4d5e");
    A(1, G + 16, 32, 1, "#000000", 0.5);
  }

  // ---------- the street lamp ----------
  {
    const lx = lay.lampX;
    P(lx, 44, 2, 122 + U, "#1a1b2c");
    P(lx, 44, 1, 122 + U, "#3a3f5e");
    P(lx - 1, 160 + U, 4, 6, "#1a1b2c");
    P(lx - 2, 165 + U, 6, 1, INK);
    line(lx, 44, lx - 7, 41, "#1a1b2c");
    line(lx - 7, 41, lx - 11, 44, "#1a1b2c");
    P(lx - 15, 45, 7, 2, INK);
    P(lx - 14, 47, 5, 4, phase === "day" ? "#a8b4c8" : "#e8f6ff");
    P(lx - 13, 47, 3, 1, phase === "day" ? "#c8d0e0" : "#ffffff");
    P(lx - 15, 51, 7, 1, INK);
  }

  // by day the night's darkness lifts off the bricks and the street
  if (phase !== "night") {
    g.globalCompositeOperation = "screen";
    A(0, 26, W, H - 26, phase === "day" ? "#3a3448" : "#221c30", 1);
    g.globalCompositeOperation = "source-over";
  }

  // ---------- glass: drops, streaks, the mullions ----------
  const [glass, gg] = canvas(W, H);
  const q = pen(gg);
  lay.wins.forEach((win, wi) => {
    const { x: x0, y: y0, w, h } = win;
    clipped(gg, x0, y0, w, h, () => {
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          const e = Math.min(x - x0, x0 + w - 1 - x, (y0 + h - 1 - y) * 2);
          if (e < 5 && bay(x, y) * 5 > e) q.A(x, y, 1, 1, "#2a1018", 0.45);
        }
      q.A(x0, y0, w, h, phase === "day" ? "#c8dcff" : "#6a86d8", phase === "day" ? 0.14 : 0.07);
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          const k = (x + y * 0.9 + wi * 17) % 58;
          if (k < 3) q.A(x, y, 1, 1, "#dfe8ff", phase === "day" ? 0.18 : 0.1);
          else if (k > 6 && k < 8) q.A(x, y, 1, 1, "#dfe8ff", 0.06);
        }
      if (wetStreet)
        for (let k = 0; k < Math.round(w / 5); k++) {
          const rx = x0 + Math.floor(r() * w);
          const ry = y0 + 14 + Math.floor(r() * (h - 16));
          q.A(rx, ry, 1, 1, "#e4ecff", 0.55);
          q.A(rx, ry + 1, 1, 1, "#1a1230", 0.35);
          if (r() < 0.35) q.A(rx, ry + 2, 1, 2 + Math.floor(r() * 5), "#dfe8ff", 0.22);
        }
      for (let x = x0; x < x0 + w; x++) if (bay(x, y0 + h - 2) < 0.5) q.A(x, y0 + h - 2, 1, 1, "#c8d4ff", 0.18);
    });
    for (let k = 1; k < Math.max(1, win.slots); k++) {
      const m = x0 + 37 * k - 1;
      q.P(m, y0, 2, h, "#1e1828");
      q.P(m, y0, 1, h, "#3e3452");
    }
    q.P(x0, y0 + 3, w, 1, "#1e1828");
  });
  clipped(gg, D.x + 4, D.y + 4, 25, 30, () => {
    q.A(D.x + 4, D.y + 4, 25, 30, "#6a86d8", 0.07);
    for (let y = D.y + 4; y < D.y + 34; y++) for (let x = D.x + 4; x < D.x + 29; x++) if ((x + y) % 31 < 2) q.A(x, y, 1, 1, "#dfe8ff", 0.1);
  });

  // ---------- the wet pavement over its own reflection ----------
  let wet: HTMLCanvasElement | null = null;
  if (wetStreet) {
    const [wc, wg] = canvas(W, H);
    const v = pen(wg);
    const spill = (xa: number, xb: number, a: number, col: string) => {
      for (let y = G; y < G + 16; y++) {
        const t = (y - G) / 16;
        const sp = Math.round(t * 8);
        const qq = Math.ceil((1 - t) * 3) / 3;
        v.A(xa - sp, y, xb - xa + sp * 2, 1, col, a * qq * (open ? 1 : 0.4));
      }
    };
    for (const w of lay.wins.filter((x) => x.floor === 0)) spill(w.x + 2, w.x + w.w - 1, 0.16, "#ffb46a");
    spill(D.x + 4, D.x + 29, 0.3, "#ffd090");
    for (let y = G; y < G + 16; y += 8) v.A(0, y, W, 1, "#0c0d1c", 0.7);
    for (let qq = 0; qq < 2; qq++) for (let x = (qq % 2) * 9; x < W; x += 18) v.A(x, G + 1 + qq * 8, 1, 7, "#0c0d1c", 0.6);
    for (let qq = 0; qq < 2; qq++) for (let x = (qq % 2) * 9 + 1; x < W; x += 18) v.A(x, G + 1 + qq * 8, 6, 1, "#6f7ab8", 0.12);
    for (const pd of puddles(lay)) {
      v.A(pd[0] - pd[2] + 3, pd[1] - pd[3] - 1, pd[2] * 2 - 6, 1, "#0c0d1c", 0.6);
      v.A(pd[0] - pd[2] + 4, pd[1] + pd[3] + 1, pd[2] * 2 - 8, 1, "#9fb4e8", 0.3);
    }
    v.glow(lay.lampX - 10, G + 10, 26, 7, "#bfe6ff", 0.3, 4);
    wet = wc;
  }

  // ---------- vignette ----------
  const [front, fg] = canvas(W, H);
  const f = pen(fg);
  for (let k = 0; k < 4; k++) {
    const a = 0.12;
    f.A(0, k * 2, W, 2, "#05040b", (a * (4 - k)) / 2);
    f.A(0, H - 2 - k * 2, W, 2, "#05040b", (a * (4 - k)) / 2);
    f.A(k * 3, 0, 3, H, "#05040b", (a * (4 - k)) / 1.5);
    f.A(W - 3 - k * 3, 0, 3, H, "#05040b", (a * (4 - k)) / 1.5);
  }

  return { bg, glass, wet, front, buzz, lit, wetStreet, weather, interior: inside };
}

/** Puddles on the pavement: centre x, centre y, half width, half height. */
export function puddles(lay: StreetLayout): [number, number, number, number][] {
  const G = lay.walk;
  const W = lay.width;
  return [
    [Math.round(W * 0.2), G + 11, 22, 2],
    [Math.round(W * 0.69), G + 12, 26, 2],
    [Math.round(W * 0.33), G + 7, 10, 1],
  ];
}
