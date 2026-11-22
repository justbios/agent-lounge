import { MINE, THEIRS, THIRD } from "../fx";

/*
 * The living pictures of the games hall: each machine's screen shows its game played by nobody, in a loop, drawn in
 * big square pixels. A picture is a pure function of its own clock, so it can stand still, crawl or run, and two of
 * the same never drift apart. Nothing here knows about a real game's state: these are signs over the door.
 */

/** Where a picture is drawn: `w`×`h` art pixels, each `k` device pixels. */
export interface Pen {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  k: number;
}

/** every picture is this many art pixels tall; its width follows the card */
export const ART_H = 40;

export type SceneId =
  | "arena"
  | "raid"
  | "chess"
  | "checkers"
  | "hockey"
  | "sumo"
  | "four"
  | "ttt"
  | "pong"
  | "cables"
  | "dendy"
  | "beasts";

export interface Scene {
  /** the loop's length, s */
  loop: number;
  /** the moment the picture holds when nothing may move */
  pose: number;
  draw: (p: Pen, t: number) => void;
}

const TAU = Math.PI * 2;
const INK = "#07050d";
const WHITE = "#f7f1ff";
const ORANGE = "#ff9a5b";
const BLUE = "#6ab7f0";

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** how far `t` is along the stretch from `a` to `b`, held at its ends */
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeIn = (u: number) => u * u;
const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const smooth = (u: number) => u * u * (3 - 2 * u);
/** there and back over `period`, in straight lines */
const ping = (t: number, period: number) => {
  const u = (((t / period) % 1) + 1) % 1;
  return u < 0.5 ? u * 2 : 2 - u * 2;
};
/** a number between 0 and 1 that is always the same for the same `i` */
const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A block of art pixels: it slides by device pixels, yet its size stays whole art pixels. */
function box(p: Pen, x: number, y: number, w: number, h: number, c: string) {
  p.ctx.fillStyle = c;
  p.ctx.fillRect(Math.round(x * p.k), Math.round(y * p.k), Math.round(w * p.k), Math.round(h * p.k));
}

function faded(p: Pen, a: number, paint: () => void) {
  if (a <= 0.01) return;
  const was = p.ctx.globalAlpha;
  p.ctx.globalAlpha = was * clamp(a);
  paint();
  p.ctx.globalAlpha = was;
}

/** A disc or an oval in rows of art pixels. */
function oval(p: Pen, cx: number, cy: number, rx: number, ry: number, c: string) {
  const rows = Math.round(ry * 2);
  for (let j = 0; j < rows; j++) {
    const yy = (j + 0.5 - rows / 2) / ry;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - yy * yy)));
    if (half > 0) box(p, cx - half, cy - rows / 2 + j, half * 2, 1, c);
  }
}
const disc = (p: Pen, cx: number, cy: number, r: number, c: string) => oval(p, cx, cy, r, r, c);

/** A ring, only as far round as `part` (0 to 1) from the top, clockwise: a mark being drawn. */
function ring(p: Pen, cx: number, cy: number, r: number, c: string, part = 1) {
  const n = Math.ceil(r);
  for (let j = -n; j < n; j++) {
    for (let i = -n; i < n; i++) {
      const dx = i + 0.5;
      const dy = j + 0.5;
      const d = Math.hypot(dx, dy);
      if (d > r || d < r - 1.7) continue;
      const a = (Math.atan2(dx, -dy) + TAU) % TAU;
      if (a <= part * TAU) box(p, cx + i, cy + j, 1, 1, c);
    }
  }
}

/** A little bitmap: `#` in `body`, `o` in `mark`. With `edge` it is outlined first, to stand off any ground. */
function stamp(p: Pen, x: number, y: number, rows: readonly string[], body: string, mark: string, edge?: string) {
  const run = (dx: number, dy: number, only?: string) => {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === ".") continue;
        box(p, x + i + dx, y + j + dy, 1, 1, only ?? (ch === "o" ? mark : body));
      }
    });
  };
  if (edge) {
    run(-1, 0, edge);
    run(1, 0, edge);
    run(0, -1, edge);
    run(0, 1, edge);
  }
  run(0, 0);
}

/** A few sparks flying out of a point: `u` runs 0 to 1 over their life. */
function burst(p: Pen, x: number, y: number, u: number, c: string, n = 6, reach = 6) {
  if (u <= 0 || u >= 1) return;
  faded(p, 1 - u * u, () => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.4;
      const d = 1 + easeOut(u) * reach * (0.6 + 0.4 * hash(i));
      box(p, x + Math.cos(a) * d - 0.5, y + Math.sin(a) * d - 0.5, 1, 1, c);
    }
  });
}

/* ---------- ping-pong: a ball across a table ---------- */

function pong(p: Pen, t: number) {
  const { w, h } = p;
  const cx = w / 2;
  box(p, 0, 0, w, h, "#0c2a25");
  box(p, 3, 3, w - 6, h - 6, "#103830");
  box(p, 0, 1, w, 1, "#cfe6dc");
  box(p, 0, h - 2, w, 1, "#cfe6dc");
  for (let y = 4; y < h - 4; y += 4) box(p, Math.floor(cx), y, 1, 2, "#e9f2ea");

  const left = 6;
  const right = w - 8;
  const period = 2.3;
  const ballAt = (at: number) => {
    const u = (((at / period) % 1) + 1) % 1;
    return {
      x: u < 0.5 ? lerp(left, right, u * 2) : lerp(right, left, u * 2 - 1),
      y: 4 + ping(at + 0.31, 1.42) * (h - 10),
    };
  };
  const ball = ballAt(t);
  // a paddle is level with the ball as it arrives, and drifts back to the middle as it leaves
  const near = (ball.x - left) / (right - left);
  const mid = h / 2 - 1;
  const ly = lerp(ball.y, mid, smooth(clamp(near * 1.6))) - 3;
  const ry = lerp(ball.y, mid, smooth(clamp((1 - near) * 1.6))) - 3;
  const lit = (d: number) => d < 0.045;
  box(p, 3, clamp(ly, 2, h - 11), 3, 8, INK);
  box(p, 3, clamp(ly, 2, h - 11) + 1, 2, 6, lit(near) ? "#fff4c9" : MINE);
  box(p, w - 6, clamp(ry, 2, h - 11), 3, 8, INK);
  box(p, w - 5, clamp(ry, 2, h - 11) + 1, 2, 6, lit(1 - near) ? "#e2ecff" : THEIRS);
  for (let i = 4; i >= 1; i--) {
    const was = ballAt(t - i * 0.028);
    faded(p, 0.34 - i * 0.07, () => box(p, was.x, was.y, 2, 2, "#e9f2ea"));
  }
  box(p, ball.x, ball.y, 2, 2, "#ffffff");
  burst(p, left + 1, ball.y + 1, span(near, 0, 0.09), "#fff4c9", 4, 4);
  burst(p, right + 1, ball.y + 1, span(1 - near, 0, 0.09), "#e2ecff", 4, 4);
}

/* ---------- air hockey: a puck between two mallets ---------- */

function hockey(p: Pen, t: number) {
  const { w, h } = p;
  const cx = w / 2;
  const cy = h / 2;
  box(p, 0, 0, w, h, "#0b1626");
  box(p, 1, 1, w - 2, h - 2, "#8a6df0");
  box(p, 2, 2, w - 4, h - 4, "#17395c");
  box(p, 3, 3, w - 6, h - 6, "#1b446b");
  ring(p, cx, cy, 7, "#d2505c");
  box(p, Math.floor(cx), 3, 1, h - 6, "#d2505c");
  ring(p, 3, cy, 9, "#3f7fb5");
  ring(p, w - 3, cy, 9, "#3f7fb5");
  box(p, 0, 0, 3, h, "#0b1626");
  box(p, w - 3, 0, 3, h, "#0b1626");
  box(p, 1, 1, 2, h - 2, "#8a6df0");
  box(p, w - 3, 1, 2, h - 2, "#8a6df0");
  // the two goals: gaps in the rail, lit in their owner's colour
  box(p, 1, cy - 6, 2, 12, INK);
  box(p, 1, cy - 6, 1, 12, MINE);
  box(p, w - 3, cy - 6, 2, 12, INK);
  box(p, w - 2, cy - 6, 1, 12, THEIRS);

  const puckAt = (at: number) => ({
    x: 9 + ping(at, 1.9) * (w - 18),
    y: 6 + ping(at + 0.4, 1.27) * (h - 12),
  });
  const puck = puckAt(t);
  const near = (puck.x - 9) / (w - 18);
  const mallet = (side: number) => {
    const close = side < 0 ? 1 - near : near;
    const follow = smooth(clamp(close * 1.5 - 0.3));
    const home = side < 0 ? 12 : w - 12;
    const x = lerp(home, puck.x + side * -4.5, follow * 0.55);
    const y = lerp(cy + Math.sin(t * 1.3 + side) * 4, puck.y, follow);
    const c = side < 0 ? MINE : THEIRS;
    faded(p, 0.35, () => oval(p, x + 1, y + 1.5, 4, 4, INK));
    disc(p, x, y, 4, INK);
    disc(p, x, y, 3, c);
    disc(p, x, y, 1.5, side < 0 ? "#fff4c9" : "#e2ecff");
  };
  mallet(-1);
  mallet(1);
  for (let i = 5; i >= 1; i--) {
    const was = puckAt(t - i * 0.03);
    faded(p, 0.3 - i * 0.05, () => disc(p, was.x, was.y, 2, "#cfe9ff"));
  }
  disc(p, puck.x, puck.y, 2.5, INK);
  disc(p, puck.x, puck.y, 1.5, "#f1ebdb");
}

/* ---------- sumo: two blobs bump on an ice floe ---------- */

const SUMO_LOOP = 3.6;

function sumo(p: Pen, t: number) {
  const { w, h } = p;
  const cx = w / 2;
  const cy = h / 2;
  const u = t % SUMO_LOOP;
  box(p, 0, 0, w, h, "#082029");
  for (let i = 0; i < 12; i++) {
    const x = (((hash(i) * w + t * (i % 2 ? 2.2 : -1.6)) % w) + w) % w;
    const y = Math.floor(hash(i + 20) * h);
    if (Math.hypot(x - cx, (y - cy) * 1.1) > 19) box(p, x, y, 3, 1, "#14485c");
  }
  // the floe leans a hair under whoever is near its edge
  const tip = span(u, 1.0, 1.6) * (1 - span(u, 2.3, 2.8));
  oval(p, cx, cy + 2, 18, 17, "#0d3344");
  oval(p, cx, cy + 1 + tip * 0.6, 18, 17, "#7fb8d4");
  oval(p, cx, cy, 17.5, 16, "#d6eeff");
  oval(p, cx - 2, cy - 2, 10, 9, "#ecf8ff");
  box(p, cx - 9, cy + 6, 4, 1, "#a5cfe6");
  box(p, cx - 6, cy + 7, 3, 1, "#a5cfe6");
  box(p, cx + 5, cy - 9, 1, 4, "#a5cfe6");
  box(p, cx + 6, cy - 6, 3, 1, "#a5cfe6");

  const crouch = span(u, 0.1, 0.55) * (1 - span(u, 0.55, 0.7));
  const dash = easeIn(span(u, 0.55, 0.85));
  const back = easeOut(span(u, 0.85, 1.6));
  const home = smooth(span(u, 2.4, 3.4));
  const wobble = span(u, 1.5, 1.7) * (1 - span(u, 2.3, 2.5)) * Math.sin(u * 22) * 0.8;
  // yellow holds its ground after the bump; blue is sent to the edge and teeters there
  const ax = lerp(lerp(lerp(cx - 10, cx - 4, dash), cx - 7, back), cx - 10, home);
  const bx = lerp(lerp(lerp(cx + 10, cx + 4, dash), cx + 14, back), cx + 10, home) + wobble;
  const squash = span(u, 0.85, 0.93) * (1 - span(u, 0.93, 1.1));
  const blob = (x: number, c: string, lite: string, face: number, lean: number) => {
    const rx = 4.5 + crouch * 0.8 - squash * 1.2;
    const ry = 4.5 - crouch * 0.9 + squash * 0.9;
    const y = cy + 1 + crouch * 0.9 - squash * 0.5;
    faded(p, 0.3, () => oval(p, x, cy + 5.5, 4.5, 1.5, "#2d6f8c"));
    oval(p, x + lean, y, rx + 1, ry + 1, INK);
    oval(p, x + lean, y, rx, ry, c);
    oval(p, x + lean - 1, y - 1.5, rx - 2.2, ry - 2.6, lite);
    box(p, x + lean + face * 2 - 0.5, y - 1, 1, 2, INK);
    box(p, x + lean + face * 0.2 - 0.5, y - 1, 1, 2, INK);
  };
  blob(ax, MINE, "#fff4c9", 1, 0);
  blob(bx, THEIRS, "#e2ecff", -1, wobble * 0.6);
  burst(p, cx, cy, span(u, 0.85, 1.2), "#ffffff", 8, 7);
  // the one at the edge sweats
  const fear = span(u, 1.55, 1.7) * (1 - span(u, 2.2, 2.35));
  faded(p, fear, () => {
    box(p, bx + 5, cy - 5 - (u * 6) % 2, 1, 2, "#ffffff");
    box(p, bx + 3, cy - 7 + (u * 5) % 2, 1, 1, "#ffffff");
  });
}

/* ---------- the boards chess and draughts share ---------- */

const SQ = 8;
const LIGHT = "#ecd9b0";
const DARK = "#a9794f";

/** The board's left edge: eight squares, centred, the wood of the table either side. */
function board(p: Pen): number {
  const x0 = Math.round((p.w - SQ * 8) / 2);
  box(p, 0, 0, p.w, p.h, "#3b2a1c");
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 8; c++) box(p, x0 + c * SQ, r * SQ, SQ, SQ, (c + r) % 2 ? DARK : LIGHT);
  }
  if (x0 > 0) {
    box(p, x0 - 1, 0, 1, p.h, "#22170e");
    box(p, x0 + SQ * 8, 0, 1, p.h, "#22170e");
  }
  return x0;
}

const KNIGHT = [".##...", "####..", "#o###.", "#####.", "..###.", ".####.", "######"];
const PAWN = ["......", "..##..", ".####.", "..##..", "..##..", ".####.", "######"];
const ROOK = ["#.##.#", "######", ".####.", ".####.", ".####.", ".####.", "######"];
const KING = ["..##..", ".####.", "..##..", "######", "#.##.#", ".####.", "######"];
const PALE: [string, string, string] = [WHITE, "#9d8fc0", "#231b30"];
const DUSK: [string, string, string] = ["#30254a", "#8674b8", "#0f0a1a"];

const man = (p: Pen, x: number, y: number, rows: readonly string[], [body, mark, edge]: [string, string, string]) =>
  stamp(p, x + 1, y, rows, body, mark, edge);

/** a knight's round trip in eight hops, as column and row */
const HOPS: [number, number][] = [
  [1, 4],
  [2, 2],
  [4, 3],
  [6, 4],
  [5, 2],
  [3, 1],
  [1, 2],
  [3, 3],
];

function chess(p: Pen, t: number) {
  const x0 = board(p);
  const leg = Math.floor(t) % HOPS.length;
  const u = t - Math.floor(t);
  const [fc, fr] = HOPS[leg];
  const [tc, tr] = HOPS[(leg + 1) % HOPS.length];
  const fly = smooth(span(u, 0.42, 0.9));
  // where it came from and where it lands, as the real board marks a move
  box(p, x0 + fc * SQ, fr * SQ, SQ, SQ, "rgba(255, 196, 86, 0.42)");
  faded(p, span(u, 0.1, 0.3), () => box(p, x0 + tc * SQ + 3, tr * SQ + 3, 2, 2, "rgba(35, 27, 48, 0.55)"));
  faded(p, fly, () => box(p, x0 + tc * SQ, tr * SQ, SQ, SQ, "rgba(255, 196, 86, 0.5)"));

  man(p, x0, 0, ROOK, DUSK);
  man(p, x0 + 4 * SQ, 0, KING, DUSK);
  man(p, x0 + 7 * SQ, 0, ROOK, DUSK);
  man(p, x0 + 2 * SQ, SQ, PAWN, DUSK);
  man(p, x0 + 5 * SQ, SQ, PAWN, DUSK);
  man(p, x0 + 7 * SQ, SQ, PAWN, DUSK);
  man(p, x0, 3 * SQ, PAWN, PALE);
  man(p, x0 + 5 * SQ, 4 * SQ, PAWN, PALE);
  man(p, x0 + 7 * SQ, 3 * SQ, PAWN, PALE);

  const x = lerp(fc, tc, fly) * SQ;
  const y = lerp(fr, tr, fly) * SQ;
  const up = Math.sin(fly * Math.PI) * 6;
  // it gathers itself before the hop and sits down after it
  const dip = span(u, 0.3, 0.42) * (1 - span(u, 0.42, 0.5)) + span(u, 0.9, 0.94) * (1 - span(u, 0.94, 1));
  faded(p, 0.3 - up * 0.02, () => oval(p, x0 + x + 4, y + 7.5, 3 - up * 0.2, 1, INK));
  man(p, x0 + x, y - up + dip, KNIGHT, PALE);
  burst(p, x0 + tc * SQ + 4, tr * SQ + 7, span(u, 0.9, 1.15), "#fff4c9", 4, 3);
}

/* ---------- draughts: a man takes, and is taken back ---------- */

const CHK_LOOP = 5.2;

function checkers(p: Pen, t: number) {
  const x0 = board(p);
  const u = t % CHK_LOOP;
  const piece = (c: number, r: number, pale: boolean, lift = 0, scale = 1) => {
    const x = x0 + c * SQ + 4;
    const y = r * SQ + 4 - lift;
    if (scale <= 0.05) return;
    faded(p, 0.28, () => oval(p, x, r * SQ + 5 + lift * 0.1, 3.2 * scale, 2.6 * scale, INK));
    disc(p, x, y, 3.5 * scale, pale ? "#231b30" : "#0f0a1a");
    disc(p, x, y - 0.5, 3 * scale, pale ? WHITE : "#3a2d58");
    if (scale > 0.8) ring(p, x, y - 0.5, 2, pale ? "#c9bfe0" : "#6a5a94");
  };
  const still: [number, number, boolean][] = [
    [1, 0, false],
    [3, 0, false],
    [5, 0, false],
    [7, 0, false],
    [0, 1, false],
    [2, 1, false],
    [0, 3, true],
    [2, 3, true],
    [1, 4, true],
    [5, 4, true],
    [7, 4, true],
    [6, 3, true],
  ];
  // the pale man on d1 takes over e2 to f3; the dark man on g4 takes it back over f3 to e2
  const hop1 = smooth(span(u, 0.9, 1.45));
  const hop2 = smooth(span(u, 2.5, 3.05));
  const homeward = smooth(span(u, 4.3, 4.8));
  const lit = 1 - span(u, 4.2, 4.4);
  const mark = (c: number, r: number, a: number) =>
    a > 0.01 && box(p, x0 + c * SQ, r * SQ, SQ, SQ, `rgba(255, 196, 86, ${(0.45 * a).toFixed(3)})`);
  mark(3, 4, span(u, 0.3, 0.5) * (1 - span(u, 2.4, 2.6)));
  mark(5, 2, hop1 * (1 - span(u, 2.4, 2.6)));
  mark(6, 1, span(u, 2.1, 2.3) * lit);
  mark(4, 3, hop2 * lit);
  still.forEach(([c, r, pale]) => piece(c, r, pale));

  // the dark man in the middle: taken by the first hop, back on its square as the loop closes
  if (u < 2.5) piece(4, 3, false, 0, 1 - span(u, 1.15, 1.4));
  else piece(4, 3, false, 0, span(u, 4.8, 5.15));
  burst(p, x0 + 4 * SQ + 4, 3 * SQ + 4, span(u, 1.15, 1.6), "#c9a6ff", 7, 6);

  // the pale mover: over and onto f3, taken there in turn, and set down again where it began
  if (u < 3.1) piece(lerp(3, 5, hop1), lerp(4, 2, hop1), true, Math.sin(hop1 * Math.PI) * 5, 1 - span(u, 2.75, 3.0));
  else piece(3, 4, true, 0, span(u, 4.4, 4.9));
  burst(p, x0 + 5 * SQ + 4, 2 * SQ + 4, span(u, 2.75, 3.2), "#fff4c9", 7, 6);

  // the dark man that takes back, then walks home
  piece(lerp(lerp(6, 4, hop2), 6, homeward), lerp(lerp(1, 3, hop2), 1, homeward), false, Math.sin(hop2 * Math.PI) * 5);
}

/* ---------- four in a row: discs drop, four light up ---------- */

const FOUR_LOOP = 6.6;
/** column, then whose disc: the orange ones end four along the floor */
const DROPS: [number, boolean][] = [
  [3, true],
  [3, false],
  [4, true],
  [4, false],
  [2, true],
  [5, false],
  [1, true],
];

function four(p: Pen, t: number) {
  const { w, h } = p;
  const u = t % FOUR_LOOP;
  const x0 = Math.round((w - 7 * SQ) / 2);
  box(p, 0, 0, w, h, "#0a0f24");
  box(p, x0 - 2, 0, 7 * SQ + 4, h, "#141f4d");
  box(p, x0 - 1, 0, 7 * SQ + 2, h, "#1c2c66");
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 7; c++) disc(p, x0 + c * SQ + 4, r * SQ + 4, 3, "#080c1f");
  }
  const out = easeIn(span(u, 5.7, 6.4));
  const height = [0, 0, 0, 0, 0, 0, 0];
  const blink = u > 4.5 && u < 5.7 && Math.floor(u * 5) % 2 === 0;
  DROPS.forEach(([col, orange], i) => {
    const row = 4 - height[col]++;
    const at = 0.3 + i * 0.58;
    if (u < at) return;
    const fall = span(u, at, at + 0.32);
    const bounce = Math.sin(span(u, at + 0.32, at + 0.5) * Math.PI) * 1.6;
    const y = lerp(-4, row * SQ + 4, easeIn(fall)) - bounce + out * (h + 8);
    const x = x0 + col * SQ + 4;
    const won = orange && row === 4;
    disc(p, x, y, 3, orange ? "#b85a2a" : "#2f6fa8");
    disc(p, x, y - 0.5, 2.5, won && blink ? "#ffffff" : orange ? ORANGE : BLUE);
    if (!(won && blink)) box(p, x - 1.5, y - 2, 1, 1, orange ? "#ffd0ae" : "#c8e6ff");
  });
  // the hand above the board: the next disc waits over its column
  const next = Math.floor((u - 0.3) / 0.58) + 1;
  if (u < 4.0 && next >= 0 && next < DROPS.length) {
    const [col, orange] = DROPS[next];
    const wait = span(u, 0.3 + next * 0.58 - 0.3, 0.3 + next * 0.58);
    faded(p, wait * 0.9, () => box(p, x0 + col * SQ + 2, 0, 4, 1, orange ? ORANGE : BLUE));
  }
  const win = span(u, 4.45, 4.7) * (1 - out);
  faded(p, win * 0.8, () => box(p, x0 + SQ, 4 * SQ + 3.5, lerp(0, 4 * SQ, win), 1, "#fff4c9"));
  burst(p, x0 + 3 * SQ, 4 * SQ + 4, span(u, 4.45, 5.0), "#fff4c9", 9, 12);
}

/* ---------- tic-tac-toe: marks chalked one after another ---------- */

const TTT_LOOP = 6.4;
/** column, row, and whether it is a cross: the crosses take the long way from corner to corner */
const MARKS: [number, number, boolean][] = [
  [1, 1, true],
  [0, 0, false],
  [2, 0, true],
  [2, 2, false],
  [0, 2, true],
];

function ttt(p: Pen, t: number) {
  const { w, h } = p;
  const u = t % TTT_LOOP;
  const cell = 12;
  const x0 = Math.round((w - cell * 3) / 2);
  const y0 = 2;
  box(p, 0, 0, w, h, "#10152a");
  box(p, x0 - 3, 0, cell * 3 + 6, h, "#161d38");
  const wipe = span(u, 5.6, 6.3);
  for (let i = 1; i < 3; i++) {
    box(p, x0 + i * cell - 0.5, y0, 1, cell * 3, "#44508a");
    box(p, x0, y0 + i * cell - 0.5, cell * 3, 1, "#44508a");
  }
  const flash = u > 4.6 && u < 5.6 && Math.floor(u * 5) % 2 === 0;
  MARKS.forEach(([c, r, cross], i) => {
    const at = 0.3 + i * 0.8;
    const done = span(u, at, at + 0.5);
    if (done <= 0) return;
    const x = x0 + c * cell + 2;
    const y = y0 + r * cell + 2;
    faded(p, 1 - wipe, () => {
      if (cross) {
        const c1 = flash ? "#ffffff" : ORANGE;
        const a = Math.ceil(clamp(done * 2) * 7);
        const b = Math.ceil(clamp(done * 2 - 1) * 7);
        for (let s = 0; s < a; s++) box(p, x + s, y + s, 2, 2, c1);
        for (let s = 0; s < b; s++) box(p, x + 6 - s, y + s, 2, 2, c1);
      } else ring(p, x + 4, y + 4, 4.2, BLUE, done);
    });
  });
  const strike = span(u, 4.2, 4.6);
  faded(p, (1 - wipe) * (strike > 0 ? 1 : 0), () => {
    const n = Math.ceil(strike * (cell * 3 - 4));
    for (let s = 0; s < n; s += 1) box(p, x0 + cell * 3 - 3 - s, y0 + 2 + s, 2, 1, "#fff4c9");
  });
  burst(p, x0 + cell * 1.5, y0 + cell * 1.5, span(u, 4.6, 5.2), "#fff4c9", 8, 14);
}

/* ---------- cables: three wires race across the floor ---------- */

const CAB_LOOP = 5.2;

function cables(p: Pen, t: number) {
  const { w, h } = p;
  const u = t % CAB_LOOP;
  box(p, 0, 0, w, h, "#0d0b14");
  for (let y = 3; y < h; y += 6) {
    for (let x = 3; x < w; x += 6) box(p, x, y, 1, 1, "#211b36");
  }
  const g = (f: number) => Math.round((w * f) / 2) * 2;
  const wires: { c: string; lite: string; path: [number, number][] }[] = [
    {
      c: MINE,
      lite: "#fff4c9",
      path: [
        [0, 30],
        [g(0.28), 30],
        [g(0.28), 10],
        [g(0.54), 10],
        [g(0.54), 20],
        [g(0.82), 20],
      ],
    },
    {
      c: THEIRS,
      lite: "#e2ecff",
      path: [
        [w, 34],
        [g(0.7), 34],
        [g(0.7), 27],
        [g(0.4), 27],
        [g(0.4), 36],
        [g(0.12), 36],
      ],
    },
    {
      c: THIRD,
      lite: "#ffd3e3",
      path: [
        [g(0.9), 0],
        [g(0.9), 6],
        [g(0.66), 6],
        [g(0.66), 17],
      ],
    },
  ];
  const grow = span(u, 0.2, 3.3);
  const fade = 1 - span(u, 4.4, 5.1);
  const crash = span(u, 3.3, 3.9);
  wires.forEach((wire, n) => {
    const total = wire.path
      .slice(1)
      .reduce((s, [x, y], i) => s + Math.abs(x - wire.path[i][0]) + Math.abs(y - wire.path[i][1]), 0);
    let left = total * grow;
    let hx = wire.path[0][0];
    let hy = wire.path[0][1];
    const dead = n === 2 && crash > 0;
    faded(p, fade * (dead && Math.floor(u * 9) % 2 ? 0.35 : 1), () => {
      for (let i = 1; i < wire.path.length && left > 0; i++) {
        const [ax, ay] = wire.path[i - 1];
        const [bx, by] = wire.path[i];
        const len = Math.abs(bx - ax) + Math.abs(by - ay);
        const part = Math.min(1, left / len);
        hx = lerp(ax, bx, part);
        hy = lerp(ay, by, part);
        box(p, Math.min(ax, hx) - 1, Math.min(ay, hy) - 1, Math.abs(hx - ax) + 2, Math.abs(hy - ay) + 2, wire.c);
        left -= len;
      }
      box(p, hx - 2, hy - 2, 4, 4, INK);
      box(p, hx - 1.5, hy - 1.5, 3, 3, dead ? "#ffffff" : wire.lite);
    });
    if (n === 2) burst(p, hx, hy + 2, crash, "#ffffff", 8, 8);
  });
}

/* ---------- the squads: little fighters with blades ---------- */

/** One fighter standing on (x, y), looking along `face`; `reach` (0 to 1) is the blade swung forward. */
function fighter(p: Pen, x: number, y: number, c: string, face: number, reach = 0, white = false) {
  const body = white ? "#ffffff" : c;
  faded(p, 0.3, () => oval(p, x, y, 3.5, 1.2, INK));
  box(p, x - 2, y - 3, 1, 3, INK);
  box(p, x + 1, y - 3, 1, 3, INK);
  box(p, x - 2.5, y - 7, 5, 4, INK);
  box(p, x - 2, y - 7, 4, 4, body);
  box(p, x - 2, y - 10, 4, 3, white ? "#ffffff" : "#f0c9a4");
  box(p, x - 2.5, y - 11, 5, 2, white ? "#ffffff" : c);
  box(p, x + face * 1 - 0.5, y - 9, 1, 1, INK);
  // the blade: upright at rest, level as it lands
  if (reach > 0.5) box(p, x + (face > 0 ? 2 : -7), y - 6, 5, 1, "#f7f1ff");
  else box(p, x + face * 3 - 0.5, y - 10, 1, 5, "#d8d2c4");
}

const ARENA_LOOP = 4.8;

function arena(p: Pen, t: number) {
  const { w, h } = p;
  const u = t % ARENA_LOOP;
  box(p, 0, 0, w, h, "#1c1530");
  box(p, 0, 0, w, 8, "#150f24");
  box(p, 0, 8, w, 1, "#3a2d5c");
  // the field's hexes, hinted by their corners
  for (let r = 0; r < 5; r++) {
    for (let c = -1; c < w / 8 + 1; c++) {
      const x = c * 8 + (r % 2 ? 4 : 0);
      box(p, x, 12 + r * 6, 2, 1, "#2e2450");
      box(p, x + 4, 15 + r * 6, 2, 1, "#281f46");
    }
  }
  const beat = Math.floor(u / 0.8);
  const b = u - beat * 0.8;
  const side = beat % 2;
  const who = Math.floor(beat / 2) % 3;
  const rows = [17, 27, 37];
  const wind = span(b, 0.05, 0.22) * (1 - span(b, 0.22, 0.3));
  const go = easeIn(span(b, 0.22, 0.4)) * (1 - smooth(span(b, 0.5, 0.78)));
  const hit = span(b, 0.4, 0.62);
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < 3; i++) {
      const face = s === 0 ? 1 : -1;
      const home = s === 0 ? 9 + (i === 1 ? 6 : 0) : w - 9 - (i === 1 ? 6 : 0);
      const mine = s === side && i === who;
      const struck = s !== side && i === who && hit > 0 && hit < 1;
      const far = w - 2 * (9 + (i === 1 ? 6 : 0)) - 9;
      const x = home + face * (mine ? go * far - wind * 2 : struck ? -Math.sin(hit * Math.PI) * 3 : 0);
      const lift = mine ? Math.sin(span(b, 0.22, 0.4) * Math.PI) * 2 : 0;
      const swing = mine ? span(b, 0.32, 0.4) * (1 - span(b, 0.6, 0.7)) : 0;
      fighter(p, x, rows[i] - lift, s === 0 ? MINE : THEIRS, face, swing, struck && hit < 0.35);
    }
  }
  const tx = side === 0 ? w - 9 - (who === 1 ? 6 : 0) : 9 + (who === 1 ? 6 : 0);
  burst(p, tx, rows[who] - 6, hit, "#ffffff", 7, 6);
}

/* ---------- the raid: two squads against the monolith ---------- */

const RAID_LOOP = 6;

function raid(p: Pen, t: number) {
  const { w, h } = p;
  const u = t % RAID_LOOP;
  box(p, 0, 0, w, h, "#120d20");
  for (let i = 0; i < 9; i++) box(p, Math.floor(hash(i) * w), Math.floor(hash(i + 9) * 16), 1, 1, "#3a2d5c");
  box(p, 0, 33, w, 7, "#1d1532");
  box(p, 0, 33, w, 1, "#3a2d5c");
  const shots = Math.floor(u / 0.42);
  const s = u - shots * 0.42;
  const hitNow = s > 0.3 && u < 5.2;
  const mx = Math.round(w * 0.72) + (hitNow ? (shots % 2 ? 1 : -1) * 0.5 : 0);
  // the monolith: a slab with a seam of light down it, and an eye
  box(p, mx - 7, 4, 14, 30, INK);
  box(p, mx - 6, 5, 12, 29, "#2b2140");
  box(p, mx - 6, 5, 2, 29, "#43366b");
  box(p, mx + 4, 5, 2, 29, "#1c1530");
  box(p, mx - 6, 5, 12, 1, "#5a4a8a");
  const glow = 0.55 + 0.45 * Math.sin(u * 3.2);
  faded(p, glow, () => {
    box(p, mx - 2, 20, 4, 1, "#ff6aa8");
    box(p, mx - 3, 24, 6, 1, "#ff6aa8");
    box(p, mx - 2, 28, 4, 1, "#ff6aa8");
  });
  const charge = span(u, 3.6, 4.3);
  const beam = span(u, 4.3, 4.45) * (1 - span(u, 4.7, 4.9));
  faded(p, 0.35 + charge * 0.4, () => box(p, mx - 3 - charge, 10 - charge, 6 + charge * 2, 6 + charge * 2, "#ff6aa8"));
  box(p, mx - 2, 11, 4, 4, INK);
  box(p, mx - 1, 12, 2, 2, beam > 0 ? "#ffffff" : "#ff6aa8");
  // its strength, over its head: every hit takes a notch off
  const hp = u < 5.2 ? 1 - Math.min(shots, 12) / 14 : span(u, 5.2, 5.9);
  box(p, mx - 8, 1, 16, 2, INK);
  box(p, mx - 7, 1.5, 14 * hp, 1, hp < 0.35 ? "#ff6aa8" : "#8ee59b");

  const squad: [number, number, string][] = [
    [7, 24, MINE],
    [15, 29, MINE],
    [6, 34, THEIRS],
    [14, 38, THEIRS],
  ];
  const struck = beam > 0 ? 1 : -1;
  squad.forEach(([x, y, c], i) => {
    const mine = shots % 4 === i && u < 5.2;
    fighter(p, x - (mine && s < 0.1 ? 1 : 0), y, c, 1, mine && s < 0.14 ? 1 : 0, i === struck && Math.floor(u * 14) % 2 === 0);
    if (mine) {
      const fly = span(s, 0.05, 0.3);
      const bx = lerp(x + 6, mx - 8, fly);
      const by = lerp(y - 6, 14 + i * 4, fly);
      if (fly < 1) {
        faded(p, 0.5, () => box(p, bx - 3, by, 3, 1, c));
        box(p, bx, by - 0.5, 2, 2, "#ffffff");
      }
      burst(p, mx - 7, 14 + i * 4, span(s, 0.3, 0.42), c, 5, 4);
    }
  });
  faded(p, beam, () => {
    const [x, y] = squad[1];
    const n = 14;
    for (let i = 0; i <= n; i++) box(p, lerp(mx - 2, x + 2, i / n), lerp(13, y - 6, i / n), 2, 1, i % 2 ? "#ffffff" : "#ff6aa8");
  });
}

/* ---------- the console corner: a cartridge goes in, the telly wakes ---------- */

const DENDY_LOOP = 6;

function dendy(p: Pen, t: number) {
  const { w, h } = p;
  const u = t % DENDY_LOOP;
  box(p, 0, 0, w, h, "#171126");
  box(p, 0, 32, w, 8, "#231a36");
  box(p, 0, 32, w, 1, "#3a2d5c");
  // the telly
  const tx = Math.round(w * 0.1);
  const tw = Math.round(w * 0.46);
  box(p, tx, 4, tw, 25, INK);
  box(p, tx + 1, 5, tw - 2, 23, "#3a2d5c");
  box(p, tx + 3, 7, tw - 9, 19, INK);
  box(p, tx + tw - 5, 9, 2, 2, "#8ee59b");
  box(p, tx + tw - 5, 13, 2, 1, "#5a4a8a");
  box(p, tx + tw - 5, 15, 2, 1, "#5a4a8a");
  box(p, tx + 4, 29, 3, 3, INK);
  box(p, tx + tw - 7, 29, 3, 3, INK);
  const on = u < 5.3 ? span(u, 1.5, 1.75) : 0;
  const sx = tx + 4;
  const sw = tw - 11;
  if (on > 0) {
    const sh = Math.max(1, Math.round(17 * on));
    box(p, sx, 8 + (17 - sh) / 2, sw, sh, "#12303a");
    if (on >= 1) {
      // a little world on the screen: a floor, a jumper, a coin
      box(p, sx, 22, sw, 3, "#2f7a4a");
      box(p, sx, 22, sw, 1, "#8ee59b");
      const run = ((u - 1.75) * 9) % (sw + 4);
      const jump = Math.abs(Math.sin((u - 1.75) * 5)) * 6;
      const hx = sx + clamp(run - 2, 0, sw - 3);
      box(p, hx, 18 - jump, 3, 4, "#ff6aa8");
      box(p, hx + 2, 19 - jump, 1, 1, INK);
      for (let i = 0; i < 3; i++) {
        const cxx = sx + 5 + i * Math.max(5, Math.floor(sw / 3.4));
        if (cxx < sx + sw - 2 && Math.abs(cxx - hx) > 2) box(p, cxx, 12 + (Math.floor(u * 4 + i) % 2), 2, 2, "#ffc456");
      }
      for (let y = 9; y < 25; y += 2) faded(p, 0.14, () => box(p, sx, y, sw, 1, INK));
    }
  }
  // the cartridge drops into the console, which hides its lower half; as the loop closes it is lifted out again
  const cx = Math.round(w * 0.78);
  const drop = easeIn(span(u, 0.5, 1.1));
  const lift = easeOut(span(u, 5.3, 5.9));
  const hover = drop <= 0 || lift >= 1 ? Math.sin(u * 3) * 0.6 : 0;
  const cy = lerp(lerp(4, 17, drop), 4, lift) + hover;
  faded(p, span(u, 0, 0.3) * (1 - span(u, 5.75, 5.98)), () => {
    box(p, cx - 5, cy, 10, 10, INK);
    box(p, cx - 4, cy + 1, 8, 8, "#5a4a8a");
    box(p, cx - 3, cy + 2, 6, 4, "#ffc456");
    box(p, cx - 3, cy + 2, 6, 1, "#ff6aa8");
  });
  box(p, cx - 11, 25, 22, 7, INK);
  box(p, cx - 10, 26, 20, 5, "#d8d2c4");
  box(p, cx - 10, 30, 20, 1, "#9d95a8");
  box(p, cx - 10, 26, 20, 1, "#f7f1ff");
  box(p, cx - 6, 25, 12, 1, INK);
  box(p, cx + 6, 28, 2, 1, on > 0 ? "#ff6aa8" : "#5a4a8a");
  box(p, cx - 8, 28, 3, 1, "#ff6aa8");
  burst(p, cx, 25, span(u, 1.1, 1.5), "#fff4c9", 6, 6);
}

/* ---------- strategy: two beasts on a field of hexes ---------- */

const BEAST_LOOP = 4.4;

function beasts(p: Pen, t: number) {
  const { w, h } = p;
  const u = t % BEAST_LOOP;
  box(p, 0, 0, w, h, "#16261c");
  box(p, 0, 0, w, 9, "#101c18");
  for (let i = 0; i < 6; i++) box(p, Math.floor(hash(i + 3) * w), 2 + Math.floor(hash(i) * 5), 1, 1, "#2f5a44");
  // hexes, by their corners and their short sides
  for (let r = 0; r < 4; r++) {
    for (let c = -1; c < w / 10 + 1; c++) {
      const x = c * 10 + (r % 2 ? 5 : 0);
      const y = 12 + r * 7;
      box(p, x + 2, y, 6, 1, "#28503a");
      box(p, x, y + 3, 2, 1, "#28503a");
      box(p, x + 8, y + 3, 2, 1, "#28503a");
    }
  }
  const leap = smooth(span(u, 1.0, 1.5));
  const back = smooth(span(u, 2.1, 3.2));
  const crouch = span(u, 0.5, 1.0) * (1 - span(u, 1.0, 1.1));
  const ax = lerp(lerp(w * 0.2, w * 0.56, leap), w * 0.2, back);
  const ay = 30 - Math.sin(leap * Math.PI) * 7 * (back > 0 ? 0 : 1) + crouch;
  const hit = span(u, 1.45, 1.9);
  const bx = w * 0.74 + Math.sin(hit * Math.PI) * 3;
  // the pouncing one: four legs, a back, a head with ears
  faded(p, 0.3, () => oval(p, ax + 1, 31, 6, 1.5, INK));
  box(p, ax - 5, ay - 6, 10, 5, INK);
  box(p, ax - 4, ay - 5, 9, 3, "#ffc456");
  box(p, ax + 3, ay - 9, 5, 5, INK);
  box(p, ax + 4, ay - 8, 4, 3, "#ffc456");
  box(p, ax + 4, ay - 10, 1, 2, "#ffc456");
  box(p, ax + 7, ay - 10, 1, 2, "#ffc456");
  box(p, ax + 7, ay - 7, 1, 1, INK);
  box(p, ax - 6, ay - 6 - crouch, 2, 1, "#ffc456");
  const stride = leap > 0 && leap < 1 ? 2 : 0;
  box(p, ax - 4 - stride, ay - 2, 1, 3, INK);
  box(p, ax - 2, ay - 2, 1, 3, INK);
  box(p, ax + 2, ay - 2, 1, 3, INK);
  box(p, ax + 4 + stride, ay - 2, 1, 3, INK);
  // the one that stands its ground: a horned lump with one eye
  const white = hit > 0 && hit < 0.3;
  faded(p, 0.3, () => oval(p, bx, 31, 6, 1.5, INK));
  oval(p, bx, 25, 6, 6.5, INK);
  oval(p, bx, 25, 5, 5.5, white ? "#ffffff" : "#6ab7f0");
  oval(p, bx - 1, 23, 2.5, 2.5, white ? "#ffffff" : "#c8e6ff");
  box(p, bx - 3, 23 + Math.sin(u * 2) * 0.5, 2, 2, INK);
  box(p, bx - 5, 17, 1, 3, "#f7f1ff");
  box(p, bx + 3, 17, 1, 3, "#f7f1ff");
  burst(p, bx - 5, 24, hit, "#ffffff", 7, 6);
}

export const SCENES: Record<SceneId, Scene> = {
  arena: { loop: ARENA_LOOP, pose: 0.36, draw: arena },
  raid: { loop: RAID_LOOP, pose: 0.62, draw: raid },
  chess: { loop: HOPS.length, pose: 0.66, draw: chess },
  checkers: { loop: CHK_LOOP, pose: 1.14, draw: checkers },
  hockey: { loop: 1.9 * 1.27 * 100, pose: 0.52, draw: hockey },
  sumo: { loop: SUMO_LOOP, pose: 0.92, draw: sumo },
  four: { loop: FOUR_LOOP, pose: 4.3, draw: four },
  ttt: { loop: TTT_LOOP, pose: 4.5, draw: ttt },
  pong: { loop: 2.3 * 1.42 * 100, pose: 0.7, draw: pong },
  cables: { loop: CAB_LOOP, pose: 3.2, draw: cables },
  dendy: { loop: DENDY_LOOP, pose: 2.6, draw: dendy },
  beasts: { loop: BEAST_LOOP, pose: 1.3, draw: beasts },
};
