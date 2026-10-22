import { Rules, hashNums } from "./rollback";

/** the water round the floe, units; the floe's middle is at (C, C) */
export const W = 140;
export const C = W / 2;
/** a wrestler's radius */
export const BODY_R = 6;
export const WIN_AT = 3;
/** the floe's radius at the start of a round, and how small it melts */
export const FLOE_R = 62;
const FLOE_MIN = 10;
/** ms a step stands for */
export const STEP_MS = 10;
/** the countdown before the first round, the pause before each next one, and the fall shown in between, in steps */
export const FIRST_STEPS = 150;
const READY_STEPS = 100;
const SHOW_STEPS = 120;
/** the floe holds this many steps after the start, then melts by MELT units a step */
export const MELT_AFTER = 500;
const MELT = 0.02;
/** top speed one heads for, units/ms, and how quickly the speed changes on the ice, units/ms² */
const SPEED = 0.1;
const ACC = 0.0005;
/** within this many units of the aim one slows down to stop on it */
const NEAR = 14;
/** a dash adds this much speed towards the aim, then waits DASH_COOL steps */
const DASH = 0.14;
export const DASH_COOL = 100;
/** the fastest anything slides, after a dash or a hit */
const MAX_SPEED = 0.3;
/** how much of the speed two wrestlers meet with they bounce off with */
const BOUNCE = 0.9;
/** where a player aims, in steps of 1/AIM units, so every screen reads the same number */
const AIM = 8;

/** sqrt(3)/2: where the three start, a third of a turn apart */
const S3 = 0.8660254037844386;
const START_D = 30;

/** where each seat stands at the start, for two players and for three: seat 0 at the bottom */
export const STARTS: Record<number, readonly { x: number; y: number }[]> = {
  2: [
    { x: C, y: C + START_D },
    { x: C, y: C - START_D },
  ],
  3: [
    { x: C, y: C + START_D },
    { x: C - START_D * S3, y: C - START_D / 2 },
    { x: C + START_D * S3, y: C - START_D / 2 },
  ],
};

/** where a player points, and whether they are pressing to dash */
export interface Push {
  x: number;
  y: number;
  dash: boolean;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** One round on the floe and the match around it. */
export interface SumoState {
  n: number;
  round: number;
  body: Body[];
  /** the step each seat went into the water on, or 0 while it is on the floe */
  fell: number[];
  /** each seat's dash was held at the last step, so a dash takes a fresh press */
  held: boolean[];
  /** the step each seat can dash again on */
  cool: number[];
  /** the floe's radius */
  r: number;
  /** the latest bump: its step, where, and how hard */
  hit: { n: number; x: number; y: number; power: number };
  score: number[];
  /** the step the round starts moving on */
  go: number;
  /** the step the next round begins on once this one is decided, or 0 */
  next: number;
  /** who won the round: a seat, -1 for nobody, null while it's on */
  won: number | null;
  over: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** An aim on the grid every screen reads the same. */
export function pushAt(x: number, y: number, dash: boolean): Push {
  return { x: Math.round(clamp(x, 0, W) * AIM) / AIM, y: Math.round(clamp(y, 0, W) * AIM) / AIM, dash };
}

function round(s: SumoState, seats: number, wait: number) {
  s.round += 1;
  s.body = STARTS[seats].map((p) => ({ x: p.x, y: p.y, vx: 0, vy: 0 }));
  s.fell = s.body.map(() => 0);
  s.held = s.body.map(() => false);
  s.cool = s.body.map(() => 0);
  s.r = FLOE_R;
  s.go = s.n + wait;
  s.next = 0;
  s.won = null;
}

/** One wrestler a step on: heading for the aim as fast as the ice lets them, with a dash on a fresh press. */
function steer(s: SumoState, k: number, p: Push) {
  const b = s.body[k];
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const want = d > 0.25 ? (SPEED * Math.min(1, d / NEAR)) / d : 0;
  let ax = dx * want - b.vx;
  let ay = dy * want - b.vy;
  const a = Math.sqrt(ax * ax + ay * ay);
  const most = ACC * STEP_MS;
  if (a > most) {
    ax = (ax * most) / a;
    ay = (ay * most) / a;
  }
  b.vx += ax;
  b.vy += ay;
  if (p.dash && !s.held[k] && s.n >= s.cool[k] && d > 0.25) {
    b.vx += (dx / d) * DASH;
    b.vy += (dy / d) * DASH;
    s.cool[k] = s.n + DASH_COOL;
  }
  s.held[k] = p.dash;
  const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (v > MAX_SPEED) {
    b.vx = (b.vx * MAX_SPEED) / v;
    b.vy = (b.vy * MAX_SPEED) / v;
  }
}

/** Two wrestlers that overlap are pushed apart and bounce off each other, as equals. */
function bump(s: SumoState, i: number, j: number) {
  const a = s.body[i];
  const b = s.body[j];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const min = 2 * BODY_R;
  if (d >= min) return;
  const nx = d > 0 ? dx / d : 0;
  const ny = d > 0 ? dy / d : 1;
  const half = (min - d) / 2;
  a.x -= nx * half;
  a.y -= ny * half;
  b.x += nx * half;
  b.y += ny * half;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel >= 0) return;
  const j0 = ((1 + BOUNCE) * rel) / 2;
  a.vx += j0 * nx;
  a.vy += j0 * ny;
  b.vx -= j0 * nx;
  b.vy -= j0 * ny;
  s.hit = { n: s.n, x: a.x + nx * BODY_R, y: a.y + ny * BODY_R, power: -rel };
}

const copyState = (s: SumoState): SumoState => ({
  ...s,
  body: s.body.map((b) => ({ ...b })),
  fell: s.fell.slice(),
  held: s.held.slice(),
  cool: s.cool.slice(),
  hit: { ...s.hit },
  score: s.score.slice(),
});

const fin = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

function unpackState(v: unknown, seats: number): SumoState | null {
  const s = v as Record<string, unknown> | null;
  const list = (a: unknown, ok: (x: unknown) => boolean) => Array.isArray(a) && a.length === seats && a.every(ok);
  const body = (x: unknown) => {
    const b = x as Partial<Body> | null;
    return !!b && fin(b.x, -W, 2 * W) && fin(b.y, -W, 2 * W) && fin(b.vx, -1, 1) && fin(b.vy, -1, 1);
  };
  const hit = s?.hit as Record<string, unknown> | undefined;
  const ok =
    !!s &&
    fin(s.n, 0, 1e8) &&
    fin(s.round, 1, 1e4) &&
    list(s.body, body) &&
    list(s.fell, (n) => fin(n, 0, 1e8)) &&
    list(s.held, (h) => typeof h === "boolean") &&
    list(s.cool, (n) => fin(n, 0, 1e8)) &&
    fin(s.r, 0, FLOE_R) &&
    !!hit &&
    fin(hit.n, 0, 1e8) &&
    fin(hit.x, -W, 2 * W) &&
    fin(hit.y, -W, 2 * W) &&
    fin(hit.power, 0, 2) &&
    list(s.score, (n) => Number.isInteger(n) && fin(n, 0, WIN_AT)) &&
    fin(s.go, 0, 1e8) &&
    fin(s.next, 0, 1e8) &&
    (s.won === null || (Number.isInteger(s.won) && fin(s.won, -1, seats - 1))) &&
    typeof s.over === "boolean";
  return ok ? copyState(s as unknown as SumoState) : null;
}

/**
 * Sumo on an ice floe for two or three, as every screen plays it: each player only says where they head and when they
 * dash, and every screen slides, bumps and drops them the same way. The floe melts as the round goes on; whoever is
 * last on it takes the round.
 */
export function sumoRules(seats: number): Rules<SumoState, Push> {
  const starts = STARTS[seats];
  return {
    ms: STEP_MS,
    delay: 0,
    start() {
      const s: SumoState = {
        n: 0,
        round: 0,
        body: [],
        fell: [],
        held: [],
        cool: [],
        r: FLOE_R,
        hit: { n: 0, x: C, y: C, power: 0 },
        score: starts.map(() => 0),
        go: 0,
        next: 0,
        won: null,
        over: false,
      };
      round(s, seats, FIRST_STEPS);
      return s;
    },
    step(s, push) {
      s.n += 1;
      if (s.won !== null) {
        if (!s.over && s.next && s.n >= s.next) round(s, seats, READY_STEPS);
        return;
      }
      if (s.n < s.go) return;
      if (s.n > s.go + MELT_AFTER) s.r = Math.max(FLOE_MIN, s.r - MELT);
      for (let k = 0; k < seats; k++) if (!s.fell[k]) steer(s, k, push[k]);
      for (let k = 0; k < seats; k++) {
        const b = s.body[k];
        b.x += b.vx * STEP_MS;
        b.y += b.vy * STEP_MS;
      }
      for (let i = 0; i < seats; i++) {
        for (let j = i + 1; j < seats; j++) if (!s.fell[i] && !s.fell[j]) bump(s, i, j);
      }
      for (let k = 0; k < seats; k++) {
        const b = s.body[k];
        if (s.fell[k]) continue;
        const dx = b.x - C;
        const dy = b.y - C;
        if (dx * dx + dy * dy > s.r * s.r) s.fell[k] = s.n;
      }
      const left = s.fell.flatMap((f, k) => (f ? [] : [k]));
      if (left.length > 1) return;
      s.won = left.length === 1 ? left[0] : -1;
      if (s.won >= 0) s.score[s.won] += 1;
      if (s.won >= 0 && s.score[s.won] >= WIN_AT) s.over = true;
      else s.next = s.n + SHOW_STEPS;
    },
    copy: copyState,
    idle: (seat) => ({ x: starts[seat].x, y: starts[seat].y, dash: false }),
    same: (a, b) => a.x === b.x && a.y === b.y && a.dash === b.dash,
    guess: (last) => last,
    enc: (p) => [Math.round(p.x * AIM), Math.round(p.y * AIM), p.dash ? 1 : 0],
    dec(v) {
      if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => Number.isInteger(x))) return null;
      const [x, y, d] = v as number[];
      const ok = x >= 0 && x <= W * AIM && y >= 0 && y <= W * AIM && (d === 0 || d === 1);
      return ok ? { x: x / AIM, y: y / AIM, dash: d === 1 } : null;
    },
    sum: (s) =>
      hashNums([
        s.n,
        s.round,
        ...s.body.flatMap((b) => [b.x, b.y, b.vx, b.vy]),
        ...s.fell,
        ...s.held.map((h) => (h ? 1 : 0)),
        ...s.cool,
        s.r,
        ...s.score,
        s.go,
        s.next,
        s.won ?? -2,
        s.over ? 1 : 0,
      ]),
    pack: copyState,
    unpack: (v) => unpackState(v, seats),
  };
}
