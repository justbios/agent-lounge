import { drawCostume } from "../halloween";
import { Look, drawPerson, head } from "../people";
import { Box, Ctx, LINE, Rect, paint, px } from "../pixel";
import { INK, STATE, mix, pen } from "./px";

/*
 * One seat behind the glass, side-on to the street: a chair on the left, the agent facing right, a desk with its
 * monitor. `px` is the seat's left edge and `o` how far its window sits below the design's ground floor (y 88).
 */

const SHOES = "#2b2433";

export function chair(g: Ctx, x: number, o: number) {
  const { P } = pen(g);
  P(x + 3, 117 + o, 2, 13, INK);
  P(x + 4, 118 + o, 1, 11, "#3b2a3a");
  P(x + 3, 130 + o, 10, 2, INK);
  P(x + 4, 130 + o, 8, 1, "#4a3446");
  P(x + 7, 132 + o, 2, 4, "#2a1e2a");
  P(x + 4, 136 + o, 8, 1, "#2a1e2a");
  P(x + 4, 137 + o, 1, 1, INK);
  P(x + 11, 137 + o, 1, 1, INK);
}

export function desk(g: Ctx, x: number, o: number) {
  const { P, A } = pen(g);
  P(x + 12, 125 + o, 25, 4, INK);
  P(x + 13, 126 + o, 23, 1, "#e09a58");
  P(x + 13, 127 + o, 23, 1, "#9a5c33");
  P(x + 14, 129 + o, 2, 8, "#4e2a1c");
  P(x + 33, 129 + o, 2, 8, "#4e2a1c");
  P(x + 14, 129 + o, 1, 8, "#6a3a24");
  A(x + 12, 137 + o, 25, 1, "#1a0c10", 0.5);
}

function monitorFrame(g: Ctx, x: number, o: number, keys: boolean) {
  const { P } = pen(g);
  P(x + 21, 115 + o, 10, 8, INK);
  P(x + 29, 116 + o, 1, 6, "#2c2638");
  P(x + 25, 123 + o, 2, 2, "#2c2638");
  P(x + 23, 124 + o, 6, 1, "#2c2638");
  if (keys) P(x + 15, 124 + o, 6, 1, "#2c2638");
}

/** An empty seat's monitor, switched off. */
export function monitorOff(g: Ctx, x: number, o: number) {
  monitorFrame(g, x, o, false);
  const { P } = pen(g);
  P(x + 22, 116 + o, 7, 6, "#1d1830");
  P(x + 23, 117 + o, 1, 1, "#4a3f6a");
}

export type SeatState = "work" | "incoming" | "ask" | "done" | "idle";

/** The colour a seat's state shows: the screen, the face it lights and its tag. */
export function stateColor(s: SeatState): string {
  return s === "incoming" ? STATE.work : STATE[s];
}

/** What is on the monitor: scrolling code, a parcel on its way, a «?», a tick, or a dark screen. */
export function screen(g: Ctx, x: number, o: number, s: SeatState, t: number, clock: number, seed: number) {
  const { P } = pen(g);
  const X = x + 22;
  const Y = 116 + o;
  const c = stateColor(s);
  if (s === "idle") {
    P(X, Y, 7, 6, "#1d1830");
    P(X + 1, Y + 1, 1, 1, "#4a3f6a");
    P(X + 4, Y + 3, 2, 1, "#3a3256");
    return;
  }
  P(X, Y, 7, 6, mix(c, INK, 0.55));
  if (s === "work") {
    const scroll = Math.floor(clock / 300) + seed * 7;
    for (let r = 0; r < 5; r++) {
      const line = scroll + r;
      P(X + 1 + (line % 2), Y + 1 + r, 2 + ((line * 3) % 4), 1, line % 3 ? c : "#dfe6ff");
    }
    if (Math.floor(t * 3) % 2 === 0) P(X + 5, Y + 4, 1, 1, "#ffffff");
  } else if (s === "incoming") {
    if (Math.floor(t * 4) % 2 === 0) {
      P(X + 1, Y + 1, 5, 4, "#ffd25a");
      P(X + 2, Y + 2, 1, 1, "#3a2606");
      P(X + 4, Y + 2, 1, 1, "#3a2606");
      P(X + 3, Y + 3, 1, 1, "#3a2606");
    }
  } else if (s === "done") {
    for (const [dx, dy] of [[5, 1], [4, 2], [1, 2], [2, 3], [3, 3], [2, 4]]) P(X + dx, Y + dy, 1, 1, c);
  } else if (Math.floor(t * 2.5) % 2 === 0) {
    ["XXX", "..X", ".XX", "...", ".X."].forEach((row, j) => {
      for (let i = 0; i < 3; i++) if (row[i] === "X") P(X + 2 + i, Y + j, 1, 1, c);
    });
  }
  P(X, Y, 7, 1, mix(c, "#ffffff", 0.35));
}

export function monitor(g: Ctx, x: number, o: number, s: SeatState, t: number, clock: number, seed: number) {
  monitorFrame(g, x, o, s !== "idle");
  screen(g, x, o, s, t, clock, seed);
}

export type SitMode = "work" | "watch" | "done" | "doze";

/**
 * Someone at a desk seen from the side, facing right, in the people's own look: hair or a robot's, cat's or alien's
 * head, shirt and trousers, and a Halloween costume over it all. The head's top-left is (L, T); feet end at T + 18.
 */
export function seatedSide(g: Ctx, L: number, T: number, k: Look, mode: SitMode, tick: number) {
  const doze = mode === "doze";
  const hL = doze ? L + 1 : L;
  const hT = doze ? T + 2 : T + (mode === "work" ? (tick >> 2) & 1 : 0);
  const sil: Box[] = [
    [L + 3, T + 8, 5, 4],
    [L + 3, T + 12, 7, 2],
    [L + 8, T + 14, 2, 4],
    [L + 8, T + 18, 3, 1],
  ];
  const f: Rect[] = [
    [L + 3, T + 8, 5, 4, k.shirt],
    [L + 3, T + 8, 1, 4, k.shirtDark],
    [L + 3, T + 12, 7, 2, k.pants],
    [L + 3, T + 13, 7, 1, mix(k.pants, "#000000", 0.25)],
    [L + 8, T + 14, 2, 4, k.pants],
    [L + 8, T + 18, 3, 1, SHOES],
  ];
  if (mode === "done") {
    // leaning back with a mug
    sil.push([L + 6, T + 8, 2, 3], [L + 8, T + 6, 2, 3]);
    f.push([L + 6, T + 8, 2, 3, k.shirtDark], [L + 8, T + 6, 2, 3, "#e8e4da"], [L + 8, T + 6, 2, 1, "#ffffff"]);
  } else if (doze) {
    sil.push([L + 6, T + 10, 4, 2]);
    f.push([L + 6, T + 10, 4, 2, k.shirtDark]);
  } else {
    const up = mode === "work" ? tick & 1 : 0;
    sil.push([L + 6, T + 9, 4, 2], [L + 10, T + 10 - up, 1, 1]);
    f.push([L + 6, T + 9, 4, 2, k.shirtDark], [L + 7, T + 9, 2, 1, k.shirt], [L + 10, T + 10 - up, 1, 1, k.skin]);
  }
  const [hs, hf] = head(hL, hT, k, "side");
  paint(g, [...sil, ...hs], [...f, ...hf]);
  if (doze && k.kind === 0) {
    px(g, hL + 7, hT + 4, 1, 2, k.skin);
    px(g, hL + 6, hT + 5, 2, 1, k.skinDark);
  }
  if (k.costume) drawCostume(g, k.costume, hL + 5, hT + 18, "right", 0);
  if (mode === "done") {
    const s = Math.floor(tick / 3) % 3;
    g.globalAlpha = 0.5;
    px(g, L + 9, T + 3 - s, 1, 2, "#ffffff");
    g.globalAlpha = 1;
  }
}

const QMARK = [".XXX.", "X...X", "....X", "..XX.", "..X..", ".....", "..X.."];

/** The agent waiting on the user: up from the desk, at the glass with a «?» sign, knocking. */
export function askAtGlass(g: Ctx, x: number, o: number, k: Look, t: number) {
  const { P, A, glow } = pen(g);
  const cx = x + 10;
  const feet = 137 + o;
  const T = feet - 18;
  glow(cx, T + 10, 14, 11, STATE.ask, 0.32, 3);
  A(cx - 6, feet, 13, 1, "#1a0c10", 0.6);
  drawPerson(g, cx, feet, k, { dir: "down", step: 0, carrying: false });
  // the knocking hand, up at the glass, and the knocks themselves
  const knock = Math.floor(t * 4) % 4;
  const kx = cx + 6 + (knock === 1 || knock === 3 ? 1 : 0);
  paint(g, [[kx, T + 3, 2, 5]], [[kx, T + 6, 2, 2, k.shirtDark], [kx, T + 3, 2, 3, k.skin]]);
  if (knock === 1 || knock === 3) {
    P(kx + 3, T + 1, 1, 1, "#fff2cc");
    P(kx + 4, T + 4, 2, 1, "#fff2cc");
    P(kx + 3, T + 7, 1, 1, "#fff2cc");
  }
  // the sign held up at the chest
  const sx = cx - 8;
  const sy = T + 6;
  P(sx, sy, 13, 11, INK);
  P(sx + 1, sy + 1, 11, 9, "#f6e2b0");
  P(sx + 1, sy + 1, 11, 1, "#fff6d8");
  P(sx + 1, sy + 9, 11, 1, "#c99a5a");
  QMARK.forEach((row, j) => {
    for (let i = 0; i < 5; i++) if (row[i] === "X") P(sx + 4 + i, sy + 2 + j, 1, 1, "#9a4a08");
  });
  P(sx, sy + 5, 1, 2, k.skin);
}

/** The «zz» rising over someone dozing at the desk. */
export function zz(g: Ctx, x: number, o: number, t: number, i: number) {
  const { P } = pen(g);
  const z = (zx: number, zy: number, c: string) => {
    P(zx, zy, 3, 1, c);
    P(zx + 1, zy + 1, 1, 1, c);
    P(zx, zy + 2, 3, 1, c);
  };
  const ph = (t * 0.5 + i * 0.37) % 1;
  g.globalAlpha = Math.min(1, (1 - ph) * 2);
  z(x + 14, 113 + o - Math.round(ph * 4), "#e4dcff");
  g.globalAlpha = Math.min(1, (1 - ((ph + 0.5) % 1)) * 2);
  z(x + 18, 109 + o - Math.round(((ph + 0.5) % 1) * 4), "#b8acdc");
  g.globalAlpha = 1;
}

/** Spent tokens as a stack of paper on the desk: a sheet per third of an order of magnitude past ten thousand. */
export function paperStack(g: Ctx, x: number, o: number, tokens: number) {
  if (tokens < 1e4) return;
  const n = Math.max(1, Math.min(8, Math.round((Math.log10(tokens) - 4) * 3)));
  const base = 125 + o;
  px(g, x + 33, base - n - 1, 5, n + 1, LINE);
  for (let k = 0; k < n; k++) px(g, x + 34 - (k % 3 === 1 ? 1 : 0), base - 1 - k, 3, 1, k % 2 ? "#d9d3e6" : "#f1edf8");
}

/** A cup by the keyboard, steaming while its owner works. */
export function cup(g: Ctx, x: number, o: number, t: number, steam: boolean) {
  const { P, A } = pen(g);
  P(x + 31, 122 + o, 2, 3, "#e8e4da");
  P(x + 31, 122 + o, 2, 1, "#6a3a24");
  if (!steam) return;
  const s = Math.floor(t * 3) % 3;
  A(x + 31, 118 + o - (s === 2 ? 1 : 0), 1, 3, "#ffffff", 0.45);
  A(x + 31 + (s & 1), 115 + o, 1, 2, "#ffffff", 0.3);
}
