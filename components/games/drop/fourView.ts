"use client";

import type { Side } from "@/lib/live/duel";
import { COLS, ROWS, landing } from "@/lib/live/four";
import { sfx } from "@/lib/live/sfx";
import { botThinking } from "@/lib/live/soloStore";
import { four as snd } from "@/lib/live/sounds/drop";
import { INTRO_MS } from "../beats";
import { Ctx, Cues, Screen, Sparks, calm, glow, ring } from "../fx";
import { DISC_COLORS } from "../sprites";
import { boardBefore, clamp, discRows, ease, easeInOut, easeOut, hash, inDisc, keepBoard, lerp, seedOf, span } from "./stage";

/*
 * Four in a row as a thing standing on a café table: an upright frame with a row of slots along its top, a back
 * wall, and a front panel with round holes. Discs are drawn between the two, so a falling one is seen through
 * every hole it passes. Everything here is looks and sound; the game itself is the board it is shown.
 */

/** the canvas in its own units */
export const W = 128;
export const H = 130;
const CELL = 16;
/** where the first column and the top row of holes begin, and where the stack stands */
const LEFT = 8;
const TOP = 20;
const FLOOR = TOP + ROWS * CELL;
/** a disc held over the frame, and one out of sight above the picture */
const HAND_Y = 9;
const AWAY_Y = -9;
/** a disc is wider than the hole it shows through */
const DISC = 14;
const HOLE = 12;

/** units/ms² and what a landing keeps of its speed */
const G = 0.0015;
const BOUNCE = 0.24;
const MIN_HOP = 0.065;
const REST_V = 0.04;
const STEP_MS = 2;

const INK = "#07050d";
const WALL = "#0a0f1f";
const PANEL = { base: "#22397c", hi: "#4467cc", mid: "#2c4796", lo: "#172860", deep: "#0f1a42" };
const AMBER = "#ffc456";

const colX = (c: number) => LEFT + c * CELL + CELL / 2;
const rowY = (r: number) => TOP + r * CELL + CELL / 2;
const HOLE_ROWS = discRows(HOLE);
const DISC_ROWS = discRows(DISC);

type Paint = { w: string; s: string; h: string };

/** two "#rrggbb" colours, `k` of the way from the first to the second */
function mix(a: string, b: string, k: number): string {
  const at = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(lerp(at(a, i), at(b, i), k)).toString(16).padStart(2, "0")).join("")}`;
}

/** the same disc caught by the light: what was shade is body, and the body is half way to its own shine */
const lit = (p: Paint): Paint => ({ w: mix(p.w, p.h, 0.55), s: p.w, h: "#ffffff" });

/** One disc, lit from the top left: a dark rim that the frame hides, a bright edge, and a ring pressed into its face. */
function paintDisc(ctx: Ctx, p: Paint) {
  for (let j = 0; j < DISC; j++) {
    for (let i = 0; i < DISC; i++) {
      if (!inDisc(DISC_ROWS, i, j)) continue;
      let c = INK;
      if (inDisc(HOLE_ROWS, i - 1, j - 1)) {
        const u = i + 0.5 - DISC / 2;
        const v = j + 0.5 - DISC / 2;
        const d = Math.hypot(u, v);
        const n = (u + v) / (d * Math.SQRT2 || 1);
        if (d > 4.7) c = n < -0.3 ? p.h : n > 0.15 ? p.s : p.w;
        else if (d > 2.6 && d < 3.7) c = n < -0.45 ? p.s : n > 0.45 ? p.h : p.w;
        else c = p.w;
      }
      ctx.fillStyle = c;
      ctx.fillRect(i, j, 1, 1);
    }
  }
}

export interface FourSeen {
  cells: readonly (Side | null)[];
  /** the cell of the latest disc */
  last: number | null;
  ply: number;
  turn: Side;
  winner: Side | "draw" | null;
  line: number[] | null;
  /** the viewer's colour */
  mine: Side;
  /** the viewer may drop a disc now */
  go: boolean;
  /** the game goes on */
  live: boolean;
}

interface Disc {
  cell: number;
  col: number;
  row: number;
  side: Side;
  x: number;
  y: number;
  vy: number;
  /** held over the frame it first slides to its column: from where, since when, for how long */
  fromX: number;
  slideAt: number;
  slideMs: number;
  state: "slide" | "fall" | "rest";
  hits: number;
  hitAt: number;
  /** it goes dark from this moment, to this much */
  dimAt: number;
  dimTo: number;
  /** it lit up as one of the winning run at this moment */
  litAt: number;
}

/** a disc of the game before, on its way out through the bottom */
interface Fallen {
  x: number;
  y: number;
  vy: number;
  side: Side;
  /** it lets go this long after the bottom opens */
  wait: number;
}

interface Hand {
  x: number;
  y: number;
  /** a refused column shakes it */
  nopeAt: number;
}

interface End {
  kind: "run" | "draw" | "flag";
  won: boolean;
  /** the winning discs in the order they light up */
  run: Disc[];
  /** the disc whose landing starts it all; null when there is none to wait for */
  wait: Disc | null;
  t0: number;
  lineAt: number;
}

const NEVER = -1e9;
const LATER = 1e12;

export class FourView {
  readonly screen: Screen;
  private readonly ctx: Ctx;
  private readonly sparks = new Sparks();
  private readonly cues = new Cues();
  private scene: HTMLCanvasElement | null = null;
  private front: HTMLCanvasElement | null = null;
  private sprite: Record<Side, HTMLCanvasElement> | null = null;
  private spriteLit: Record<Side, HTMLCanvasElement> | null = null;

  private seen: FourSeen | null = null;
  private discs: Disc[] = [];
  private old: Fallen[] = [];
  private spillAt = LATER;
  private spilled = false;
  private end: End | null = null;
  private readonly hands: Record<Side, Hand> = {
    x: { x: colX(3), y: AWAY_Y, nopeAt: NEVER },
    o: { x: colX(3), y: AWAY_Y, nopeAt: NEVER },
  };
  private readonly glowCol = new Float32Array(COLS);
  private readonly rings: { x: number; y: number; at: number; color: string }[] = [];
  /** the column under the viewer's pointer, finger or focus */
  private pointer: number | null = null;
  /** it is a finger: once its disc is let go nothing points at the column any more */
  private touch = false;
  private now: number;
  private prev = 0;
  private kickAt = NEVER;
  private kickAmp = 0;
  private flashAt = NEVER;
  private freezeTill = 0;
  private twinkleAt = 0;
  private readonly seed: number;

  constructor(
    canvas: HTMLCanvasElement,
    /** the match, the two players whoever sits where, and whose id plays which colour */
    private readonly id: string,
    private readonly pair: string,
    private readonly ids: Record<Side, string>,
    private readonly solo: boolean,
  ) {
    this.screen = new Screen(canvas, W, H);
    this.ctx = canvas.getContext("2d")!;
    this.now = performance.now();
    this.seed = seedOf(id);
  }

  // ---- what the game tells it ---------------------------------------------------------------------------------

  /** The board as it stands now. The first one is simply shown; after that every new disc is dropped. */
  sync(seen: FourSeen) {
    const was = this.seen;
    const now = (this.now = performance.now());
    this.seen = seen;
    if (!was || seen.ply < was.ply) {
      this.discs = [];
      this.end = null;
      this.cues.clear();
      seen.cells.forEach((side, cell) => side && this.discs.push(this.rest(cell, side)));
      if (!was && seen.ply === 0) {
        const before = boardBefore(this.pair, this.id);
        if (before) {
          this.old = before.cells.flatMap((side, cell) => {
            if (!side) return [];
            const col = cell % COLS;
            const row = Math.floor(cell / COLS);
            const wait = hash(this.seed, col) * 90 + (ROWS - 1 - row) * 10;
            return [{ x: colX(col), y: rowY(row), vy: 0, side, wait }];
          });
          this.spillAt = now + INTRO_MS;
        }
      }
      if (seen.winner) this.finish(seen, now, true);
      return;
    }
    if (seen.ply > was.ply) {
      // a move before the old discs were let out: they go now, ahead of the new one
      if (this.old.length && this.spillAt > now) this.spillAt = now;
      seen.cells.forEach((side, cell) => {
        if (!side || was.cells[cell]) return;
        this.discs.push(cell === seen.last ? this.drop(cell, side, now) : this.rest(cell, side));
      });
      keepBoard(this.pair, this.id, [...seen.cells], seen.mine);
    }
    if (seen.winner && !was.winner) this.finish(seen, now, false);
  }

  /** The column the viewer points at, touches or has the focus on; null when none. */
  hover(col: number | null, touch = false) {
    this.touch = touch;
    if (col === this.pointer) return;
    this.pointer = col;
    if (col !== null && this.seen?.go) snd.aim(col);
  }

  /** A column that takes no more discs was asked for: the held disc shakes its head. */
  nope() {
    const s = this.seen;
    if (!s?.go) return;
    this.hands[s.mine].nopeAt = performance.now();
    sfx("illegal");
  }

  // ---- discs ------------------------------------------------------------------------------------------------------

  private rest(cell: number, side: Side): Disc {
    const col = cell % COLS;
    const row = Math.floor(cell / COLS);
    return {
      cell,
      col,
      row,
      side,
      x: colX(col),
      y: rowY(row),
      vy: 0,
      fromX: colX(col),
      slideAt: 0,
      slideMs: 0,
      state: "rest",
      hits: 2,
      hitAt: NEVER,
      dimAt: LATER,
      dimTo: 0,
      litAt: LATER,
    };
  }

  /** A new disc: it starts where its side held one over the frame, or from above the picture. */
  private drop(cell: number, side: Side, now: number): Disc {
    const d = this.rest(cell, side);
    const hand = this.hands[side];
    const held = hand.y > AWAY_Y + 2;
    d.x = d.fromX = held ? hand.x : colX(d.col);
    d.y = held ? hand.y : AWAY_Y;
    hand.y = AWAY_Y;
    if (this.touch && side === this.seen?.mine) this.pointer = null;
    const far = Math.abs(d.x - colX(d.col));
    d.slideAt = now;
    d.slideMs = far < 1 ? 0 : Math.min(170, 50 + far * 1.3);
    d.state = d.slideMs ? "slide" : "fall";
    d.hits = 0;
    return d;
  }

  private move(dt: number, now: number) {
    for (const d of this.discs) {
      if (d.state === "slide") {
        const k = span(now, d.slideAt, d.slideMs);
        d.x = lerp(d.fromX, colX(d.col), easeInOut(k));
        if (k >= 1) d.state = "fall";
        continue;
      }
      let left = d.state === "fall" ? dt : 0;
      while (left > 0 && d.state === "fall") {
        const h = Math.min(STEP_MS, left);
        left -= h;
        d.vy += G * h;
        d.y += d.vy * h;
        if (d.y >= rowY(d.row)) this.hit(d, now);
      }
    }
    if (now < this.spillAt) return;
    const since = now - this.spillAt;
    for (const f of this.old) {
      if (since < f.wait) continue;
      f.vy += G * dt;
      f.y += f.vy * dt;
    }
    this.old = this.old.filter((f) => f.y < FLOOR + DISC);
  }

  private hit(d: Disc, now: number) {
    const v = d.vy;
    d.y = rowY(d.row);
    d.hits += 1;
    if (d.hits > 1) {
      const up = v * BOUNCE;
      if (v > 0.09) snd.hop();
      d.vy = up < REST_V ? 0 : -up;
      if (up < REST_V) d.state = "rest";
      return;
    }
    d.hitAt = now;
    snd.land(d.row, ROWS, clamp(v / 0.6));
    this.kick(now, clamp(v * 2.4, 0.5, 1.5));
    if (calm()) {
      d.vy = 0;
      d.state = "rest";
    } else d.vy = -Math.max(v * BOUNCE, MIN_HOP);
    const s = this.seen;
    if (this.end?.wait === d) this.finale(this.end, now);
    else if (s && d.side !== s.mine && s.go) this.cues.at(now + 150, () => this.seen?.go && sfx("turn"));
  }

  private kick(now: number, amp: number) {
    if (calm()) return;
    this.kickAt = now;
    this.kickAmp = amp;
  }

  // ---- the end ----------------------------------------------------------------------------------------------------

  /** The game is decided: what happens waits for the last disc to land, unless the board was opened as it is. */
  private finish(seen: FourSeen, now: number, opened: boolean) {
    const won = seen.winner === seen.mine;
    const cells = seen.line ?? [];
    // from left to right, a column from the bottom up
    const order = [...cells].sort((a, b) => (a % COLS) - (b % COLS) || b - a);
    const run = order.flatMap((cell) => this.discs.filter((d) => d.cell === cell));
    const kind = seen.winner === "draw" ? "draw" : run.length ? "run" : "flag";
    const wait = opened ? null : (this.discs.find((d) => d.cell === seen.last && d.state !== "rest") ?? null);
    const end: End = { kind, won, run, wait, t0: LATER, lineAt: LATER };
    this.end = end;
    if (opened) {
      end.t0 = end.lineAt = NEVER;
      for (const d of this.discs) {
        if (run.includes(d)) d.litAt = NEVER;
        else if (kind !== "flag" || d.side !== seen.winner) [d.dimAt, d.dimTo] = [NEVER, kind === "draw" ? 0.5 : 1];
      }
    } else if (!wait) this.finale(end, now);
  }

  /** The last moment of the game, from the landing of its last disc. */
  private finale(end: End, now: number) {
    end.t0 = now;
    end.wait = null;
    const winner = this.seen?.winner;
    if (end.kind === "draw") {
      for (const d of this.discs) [d.dimAt, d.dimTo] = [now + 240 + (d.col + ROWS - 1 - d.row) * 45, 0.5];
      this.cues.at(now + 280, () => snd.even());
      return;
    }
    if (end.kind === "flag") {
      for (const d of this.discs) if (d.side !== winner) [d.dimAt, d.dimTo] = [now + 120, 1];
      return;
    }
    const still = calm();
    if (!still) {
      this.freezeTill = now + 70;
      this.flashAt = now;
      this.kick(now, 2);
    }
    const n = end.run.length;
    const step = Math.min(140, 560 / n);
    for (const d of this.discs) if (!end.run.includes(d)) [d.dimAt, d.dimTo] = [now + 120, 1];
    end.run.forEach((d, i) => {
      const at = now + 210 + i * step;
      this.cues.at(at, () => {
        d.litAt = at;
        snd.note(i, end.won);
        if (!still) this.rings.push({ x: d.x, y: rowY(d.row), at, color: DISC_COLORS[d.side].h });
      });
    });
    end.lineAt = now + 210 + n * step + 40;
    this.cues.at(end.lineAt, () => {
      snd.line(end.won);
      this.kick(end.lineAt, 1);
      if (!end.won || still) return;
      const p = DISC_COLORS[end.run[0].side];
      for (const d of end.run) {
        this.sparks.burst(d.x, rowY(d.row), 7, 0.07, [p.h, "#ffffff", AMBER], { life: 620, fall: 0.00012, size: 1.5 });
      }
    });
  }

  // ---- hands: the disc each side holds over the frame while it chooses ---------------------------------

  /** The column `side` holds a disc over right now, or null when it holds none. */
  private held(side: Side, now: number): number | null {
    const s = this.seen;
    if (!s || !s.live || s.winner || s.turn !== side) return null;
    const t = botThinking();
    if (t && t.game === this.id && t.by === this.ids[side]) {
      // an agent looking for its move: the disc wanders over the columns that still take one
      const open = Array.from({ length: COLS }, (_, c) => c).filter((c) => landing(s.cells, c) >= 0);
      if (!open.length) return null;
      const beat = Math.floor((now - t.since) / 640);
      if (beat === 0) return open.reduce((a, c) => (Math.abs(c - 3) < Math.abs(a - 3) ? c : a));
      return open[Math.floor(hash(this.seed, s.ply, beat) * open.length)];
    }
    if (side === s.mine) return s.go ? this.pointer : null;
    // a person somewhere else: nothing is known of their hand, so it waits over the middle
    return this.solo ? null : 3;
  }

  private moveHands(dt: number, now: number) {
    const s = this.seen;
    for (const side of ["x", "o"] as const) {
      const hand = this.hands[side];
      const col = this.held(side, now);
      if (col === null) {
        hand.y = ease(hand.y, AWAY_Y, dt, 40);
        continue;
      }
      const to = colX(col);
      if (hand.y < AWAY_Y + 1) hand.x = to;
      const own = !!s && side === s.mine && s.go && this.pointer === col;
      hand.x = ease(hand.x, to, dt, own ? 38 : 150);
      hand.y = ease(hand.y, HAND_Y, dt, 50);
    }
    const at = s?.go ? this.pointer : null;
    for (let c = 0; c < COLS; c++) this.glowCol[c] = ease(this.glowCol[c], c === at ? 1 : 0, dt, 55);
  }

  // ---- drawing ----------------------------------------------------------------------------------------------------

  private paintScene(ctx: Ctx) {
    // the café wall, its paper dotted, a lamp somewhere above
    ctx.fillStyle = "#191330";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#211a3d";
    for (let y = 3; y < H - 6; y += 8) for (let x = (y % 16 === 3 ? 4 : 0) + 2; x < W; x += 8) ctx.fillRect(x, y, 1, 1);
    glow(ctx, W / 2, -6, 96, AMBER, 0.13);
    // the table it stands on
    ctx.fillStyle = INK;
    ctx.fillRect(0, H - 5, W, 1);
    ctx.fillStyle = "#7a5636";
    ctx.fillRect(0, H - 4, W, 1);
    ctx.fillStyle = "#5b3d26";
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillStyle = "#4a301d";
    for (let x = 5; x < W; x += 23) ctx.fillRect(x, H - 2, 9, 1);
  }

  /** The frame seen from the front: posts, feet, the tray under the stack, and the panel with its holes. */
  private paintFront(ctx: Ctx) {
    const box = (c: string, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    const right = LEFT + COLS * CELL;
    const base = H - 5;
    // everything once in ink, a unit bigger all round: the outline
    for (const [x, y, w, h] of [
      [LEFT - 5, 12, 5, base - 12],
      [right, 12, 5, base - 12],
      [LEFT - 6, 10, 7, 3],
      [right - 1, 10, 7, 3],
      [LEFT, TOP - 3, right - LEFT, FLOOR - TOP + 9],
      [LEFT - 8, base - 3, 13, 3],
      [right - 5, base - 3, 13, 3],
    ]) {
      box(INK, x - 1, y - 1, w + 2, h + 2);
    }
    // the shadow it throws on the table
    box("rgba(7, 5, 13, 0.45)", LEFT - 4, base, right - LEFT + 12, 1);
    // posts, their caps and their feet
    for (const x of [LEFT - 5, right]) {
      box(PANEL.mid, x, 12, 5, base - 12);
      box(PANEL.hi, x, 12, 1, base - 12);
      box(PANEL.lo, x + 4, 12, 1, base - 12);
    }
    for (const x of [LEFT - 6, right - 1]) {
      box(PANEL.hi, x, 10, 7, 3);
      box(PANEL.mid, x + 1, 12, 6, 1);
    }
    for (const x of [LEFT - 8, right - 5]) {
      box(PANEL.mid, x, base - 3, 13, 3);
      box(PANEL.hi, x, base - 3, 13, 1);
    }
    // the panel, lighter along its top edge where the slots are
    box(PANEL.base, LEFT, TOP - 3, right - LEFT, FLOOR - TOP + 3);
    box(PANEL.hi, LEFT, TOP - 3, right - LEFT, 1);
    box(PANEL.mid, LEFT, TOP - 2, right - LEFT, 1);
    for (let c = 0; c < COLS; c++) box(PANEL.deep, colX(c) - 6, TOP - 2, 12, 1);
    box(PANEL.lo, LEFT, FLOOR - 1, right - LEFT, 1);
    // the tray the stack stands on, with the catch that lets it out
    box(PANEL.lo, LEFT, FLOOR, right - LEFT, 6);
    box(PANEL.mid, LEFT, FLOOR, right - LEFT, 1);
    box(PANEL.deep, LEFT, FLOOR + 5, right - LEFT, 1);
    box(PANEL.deep, right - 22, FLOOR + 2, 16, 2);
    // the holes: a bevel round each, dark where the light cannot reach, then the hole itself, and the shade the
    // panel throws on whatever is behind it
    const bevel = discRows(HOLE + 2);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x0 = colX(c) - HOLE / 2;
        const y0 = rowY(r) - HOLE / 2;
        for (let j = -1; j <= HOLE; j++) {
          for (let i = -1; i <= HOLE; i++) {
            if (inDisc(HOLE_ROWS, i, j)) {
              ctx.clearRect(x0 + i, y0 + j, 1, 1);
              if (!inDisc(HOLE_ROWS, i - 1, j - 1)) box("rgba(5, 7, 18, 0.5)", x0 + i, y0 + j, 1, 1);
            } else if (inDisc(bevel, i + 1, j + 1)) {
              const n = i + j - (HOLE - 1);
              if (n < -2) box(PANEL.lo, x0 + i, y0 + j, 1, 1);
              else if (n > 2) box(n > 8 ? PANEL.hi : PANEL.mid, x0 + i, y0 + j, 1, 1);
            }
          }
        }
      }
    }
  }

  private paint() {
    const s = this.screen;
    this.scene = s.layer((c) => this.paintScene(c));
    this.front = s.layer((c) => this.paintFront(c));
    const make = (p: Paint) => s.sprite(DISC, (c) => paintDisc(c, p));
    this.sprite = { x: make(DISC_COLORS.x), o: make(DISC_COLORS.o) };
    this.spriteLit = { x: make(lit(DISC_COLORS.x)), o: make(lit(DISC_COLORS.o)) };
  }

  private stamp(ctx: Ctx, spr: HTMLCanvasElement, x: number, y: number, a = 1) {
    if (a <= 0.01) return;
    ctx.globalAlpha = Math.min(1, a);
    this.screen.stamp(ctx, spr, x, y);
    ctx.globalAlpha = 1;
  }

  private drawDisc(ctx: Ctx, d: Disc, now: number) {
    const spr = this.sprite![d.side];
    const shine = this.spriteLit![d.side];
    if (d.state === "fall" && d.vy > 0.12 && !calm()) {
      // a streak behind a fast one, seen through the holes it has passed
      this.stamp(ctx, spr, d.x, d.y - d.vy * 27, 0.1);
      this.stamp(ctx, spr, d.x, d.y - d.vy * 18, 0.2);
      this.stamp(ctx, spr, d.x, d.y - d.vy * 9, 0.34);
    }
    const dim = d.dimTo * span(now, d.dimAt, 280);
    this.stamp(ctx, spr, d.x, d.y, 1 - 0.66 * dim);
    // a flash as it lands, and the light of a winning disc: a burst that settles into a slow pulse
    let glint = d.state === "slide" ? 0 : 0.75 * (1 - span(now, d.hitAt, 90));
    if (now >= d.litAt) {
      const since = now - d.litAt;
      const pulse = calm() ? 0.6 : 0.55 + 0.35 * Math.sin(since / 190);
      glint = Math.max(glint, lerp(1, pulse, span(since, 120, 260)));
    }
    this.stamp(ctx, shine, d.x, d.y, glint);
  }

  /** The line through the winning run, as far as it has been drawn: the winner's brightest colour, edged in ink. */
  private drawLine(ctx: Ctx, end: End, now: number) {
    const k = easeOut(span(now, end.lineAt, 190));
    if (k <= 0 || end.run.length < 2) return;
    const a = end.run[0];
    const b = end.run[end.run.length - 1];
    const [ax, ay, bx, by] = [a.x, rowY(a.row), b.x, rowY(b.row)];
    const len = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
    const past = 5;
    const steps = Math.round((len + past * 2) * k);
    const p = DISC_COLORS[a.side];
    for (const [color, half] of [
      [INK, 2],
      [p.h, 1],
    ] as const) {
      ctx.fillStyle = color;
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(ax + ux * (i - past));
        const y = Math.round(ay + uy * (i - past));
        ctx.fillRect(x - half, y - half, half * 2, half * 2);
      }
    }
  }

  /** One frame: everything moves on to `now` and is drawn. */
  frame(now: number) {
    const dt = this.prev ? clamp(now - this.prev, 0, 50) : 16;
    this.prev = this.now = now;
    const s = this.screen;
    const ctx = this.ctx;
    if (s.takeResize() || !this.scene) this.paint();
    const seen = this.seen;
    const still = calm();

    if (!this.spilled && now >= this.spillAt && this.old.length) {
      // the bottom opens once: a rattle, and the old discs are on their way
      this.spilled = true;
      snd.spill();
      this.kick(now, 1.2);
    }
    this.cues.run(now);
    this.move(now < this.freezeTill ? 0 : dt, now);
    this.moveHands(dt, now);
    this.sparks.step(dt);
    const end = this.end;
    if (end?.kind === "run" && end.won && !still && now > end.lineAt + 200 && now > this.twinkleAt) {
      // a calm loop under the result: the four keep glinting
      this.twinkleAt = now + 150;
      const d = end.run[Math.floor(Math.random() * end.run.length)];
      const p = DISC_COLORS[d.side];
      this.sparks.burst(d.x + (Math.random() - 0.5) * 12, rowY(d.row) + (Math.random() - 0.5) * 12, 1, 0.025, [p.h, "#ffffff", AMBER], {
        dir: -Math.PI / 2,
        spread: 1.4,
        life: 700,
        fall: -0.00003,
      });
    }

    const t = now - this.kickAt;
    const dy = t < 320 ? this.kickAmp * Math.exp(-t / 75) * Math.sin((Math.PI * t) / 62) : 0;

    s.blit(ctx, this.scene!);
    s.begin(ctx, 0, dy);
    // behind the panel: the back wall, the column pointed at, and the discs
    ctx.fillStyle = WALL;
    ctx.fillRect(LEFT, TOP - 2, COLS * CELL, FLOOR - TOP + 2);
    for (let c = 0; c < COLS; c++) {
      const a = this.glowCol[c];
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = "#16224c";
      ctx.fillRect(LEFT + c * CELL, TOP - 2, CELL, FLOOR - TOP + 2);
      ctx.globalAlpha = 1;
    }
    if (this.old.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(LEFT, TOP - 2, COLS * CELL, FLOOR - TOP + 4);
      ctx.clip();
      for (const f of this.old) this.stamp(ctx, this.sprite![f.side], f.x, f.y, 0.8);
      ctx.restore();
    }
    if (seen?.go && this.pointer !== null) {
      // where a disc let go here would come to rest
      const cell = landing(seen.cells, this.pointer);
      if (cell >= 0) {
        const a = this.glowCol[this.pointer] * (still ? 0.6 : 0.5 + 0.2 * Math.sin(now / 240));
        ctx.globalAlpha = a;
        ring(ctx, colX(this.pointer), rowY(Math.floor(cell / COLS)), 4.5, DISC_COLORS[seen.mine].w);
        ctx.globalAlpha = 1;
      }
    }
    for (const d of this.discs) this.drawDisc(ctx, d, now);
    // the discs held over the frame; they are not part of it, so its jolt does not move them
    s.begin(ctx);
    for (const side of ["x", "o"] as const) {
      const hand = this.hands[side];
      if (hand.y <= AWAY_Y + 0.5) continue;
      const bob = still ? 0 : Math.sin(now / 280 + (side === "x" ? 0 : 2)) * 0.9;
      const since = now - hand.nopeAt;
      const shake = since < 240 ? Math.sin(since / 22) * 2 * (1 - since / 240) : 0;
      this.stamp(ctx, this.sprite![side], hand.x + shake, hand.y + bob);
    }
    s.blit(ctx, this.front!, 0, dy);
    s.begin(ctx, 0, dy);
    // on the panel: the slot of the column pointed at, the catch, and the light of the last moment
    for (let c = 0; c < COLS; c++) {
      const a = this.glowCol[c];
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = AMBER;
      ctx.fillRect(colX(c) - 6, TOP - 2, 12, 1);
      ctx.globalAlpha = 1;
    }
    const open = this.spilled ? span(now, this.spillAt, 110) - span(now, this.spillAt + 430, 160) : 0;
    const knob = LEFT + COLS * CELL - 10 - Math.round(open * 9);
    ctx.fillStyle = INK;
    ctx.fillRect(knob - 1, FLOOR + 1, 5, 4);
    ctx.fillStyle = AMBER;
    ctx.fillRect(knob, FLOOR + 2, 3, 2);
    if (end) {
      if (end.kind === "run") this.drawLine(ctx, end, now);
      for (const d of end.run) {
        if (now < d.litAt || still) continue;
        const since = now - d.litAt;
        const a = lerp(0.42, 0.14 + 0.06 * Math.sin(since / 190), span(since, 0, 380));
        glow(ctx, d.x, rowY(d.row), 14, DISC_COLORS[d.side].w, a);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      const k = span(now, r.at, 320);
      if (k >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - k;
      ring(ctx, r.x, r.y, 6 + 8 * easeOut(k), k < 0.3 ? "#ffffff" : r.color);
      ctx.globalAlpha = 1;
    }
    const flash = 1 - span(now, this.flashAt, 130);
    if (flash > 0) {
      ctx.globalAlpha = 0.16 * flash;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(LEFT - 5, 12, COLS * CELL + 10, FLOOR - 6);
      ctx.globalAlpha = 1;
    }
    s.begin(ctx);
    this.sparks.draw(ctx, s);
  }

  dispose() {
    this.cues.clear();
    this.screen.dispose();
  }
}
