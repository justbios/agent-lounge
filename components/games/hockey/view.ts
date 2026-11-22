"use client";

import { GOAL_W, H, MALLET_R, PUCK_R, W } from "@/lib/live/hockey";
import { sndClack, sndDrop, sndPost, sndSweep, sndTap } from "@/lib/live/sounds/hockey";
import { rgba, shade } from "../../cafe/pixel";
import { Ctx, Cues, INK, Jolt, MINE, Screen, Sparks, THEIRS, calm, glow, ring } from "../fx";
import { Marks } from "./marks";
import {
  CHIPS,
  CYAN,
  END,
  FULL_H,
  FULL_W,
  HEAT_GLOW,
  HEAT_TRAIL,
  MOUTH,
  PINK,
  RAIL_LEN,
  SIDE,
  TUBE,
  TUBE_RUNS,
  beam,
  paintBody,
  paintFlash,
  paintKnob,
  paintMesh,
  paintPuck,
  paintRink,
  paintShadow,
  railAt,
  railOf,
  tubeGlow,
} from "./rink";

/** a hit or a bounce sounds at most this often */
const CLICK_MS = 70;
/** the drawn freeze at a goal, and at the goal that ends the match; the game itself never stops */
const FREEZE_MS = 110;
const FREEZE_LAST_MS = 240;
/** after a freeze the mallets ease back to where they really are */
const THAW_MS = 90;
/** a goal's light stays on this long; the last goal's until the result is in */
const LIT_MS = 1150;
/** the ice is wiped this long after a goal, in this long */
const WIPE_AT = 1150;
const WIPE_MS = 560;
/** a new puck is seen coming down this long before it lands */
const FALL_MS = 340;
const RING_MS = 620;
/** the winner starts a slow lap this long after the last goal */
const LAP_AT = 1500;
const PAPER = ["#ffffff", PINK, CYAN, "#8ee59b"];
const TRAIL = 14;
const TAU = Math.PI * 2;

export interface Spot {
  x: number;
  y: number;
}

export interface Moving extends Spot {
  vx: number;
  vy: number;
}

/** What the rink is told each frame, as this viewer sees it: their end at the bottom. */
export interface Look {
  puck: Moving | null;
  mine: Spot;
  theirs: Spot;
  /** how warm the puck is, 0 to 3 */
  heat: number;
  /** ms until the next puck lands, and where; -1 with none on its way */
  dropIn: number;
  drop: Spot;
  /** where a mouse points, when that is not where the mallet is; where a finger rests, below its mallet */
  aim: Spot | null;
  finger: Spot | null;
}

interface Hand extends Spot {
  seen: boolean;
  vx: number;
  vy: number;
  /** its last strike: when, how hard, and which way it was pushed back */
  hitAt: number;
  power: number;
  kx: number;
  ky: number;
}

interface Ring extends Spot {
  t0: number;
  life: number;
  r0: number;
  r1: number;
  color: string;
  a: number;
}

/** a light running along the tube both ways from where something touched the boards */
interface Pulse {
  at: number;
  t0: number;
  life: number;
  reach: number;
  tail: number;
  color: string;
  a: number;
}

interface Beat {
  t0: number;
  /** this viewer scored */
  mine: boolean;
  last: boolean;
  /** the goal line it went over */
  y: number;
  freeze: number;
}

const hand = (): Hand => ({ x: 0, y: 0, seen: false, vx: 0, vy: 0, hitAt: -1e9, power: 0, kx: 0, ky: 0 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/**
 * What the rink looks like, apart from the game's rules: drawn the way this viewer sees it, their end at the bottom.
 * It reads hits and bounces off the puck's sudden turns, so it shows them the same on either half, and it never
 * writes anything back to the game: a freeze, a shake or a lap of honour is only ever drawn.
 */
export class RinkView {
  readonly screen: Screen;
  private bg!: HTMLCanvasElement;
  private mesh!: HTMLCanvasElement;
  private body!: HTMLCanvasElement[];
  private knob!: HTMLCanvasElement[];
  private flash!: HTMLCanvasElement;
  private pucks!: HTMLCanvasElement[];
  private shadeM!: HTMLCanvasElement;
  private shadeP!: HTMLCanvasElement;
  private readonly dusk: HTMLCanvasElement;
  private readonly sparks = new Sparks();
  private readonly paper = new Sparks();
  private readonly jolt = new Jolt();
  private readonly marks = new Marks();
  private readonly cues = new Cues();
  private rings: Ring[] = [];
  private pulses: Pulse[] = [];
  private readonly hands = [hand(), hand()];
  private readonly tx = new Float32Array(TRAIL);
  private readonly ty = new Float32Array(TRAIL);
  private tAt = 0;
  private tLen = 0;
  private had = false;
  /** a new puck was on its way when last there was none */
  private due = false;
  private px = 0;
  private py = 0;
  private pvx = 0;
  private pvy = 0;
  private pheat = 0;
  /** the puck that went in, lying in the net while the goal has its moment */
  private ghost: (Moving & { top: boolean; heat: number; until: number }) | null = null;
  private hitAt = 0;
  private wallAt = 0;
  private emberAt = 0;
  private paperAt = 0;
  private prev = 0;
  private zoom = 1;
  private zy = H / 2;
  private litAt = Infinity;
  private beat: Beat | null = null;
  private freezeEnd = 0;
  private wipe: { t0: number; dir: number; begun: boolean } | null = null;
  private tense = { mine: false, theirs: false };
  private heatAt = -1e9;
  private won: { t0: number; mine: boolean } | null = null;
  /** when each end's posts last rang: top, bottom */
  private readonly postAt = [-1e9, -1e9];
  /** a warm puck and a match point both lift the pitch of the boards a little */
  private lift = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.screen = new Screen(canvas, FULL_W, FULL_H);
    this.dusk = document.createElement("canvas");
    this.dusk.width = W;
    this.dusk.height = H;
    const c = this.dusk.getContext("2d")!;
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.62);
    g.addColorStop(0, "rgba(4,2,12,0)");
    g.addColorStop(1, "rgba(4,2,12,0.9)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    this.paint();
  }

  private paint() {
    const s = this.screen;
    this.bg = s.layer((ctx) => {
      ctx.translate(SIDE, END);
      paintRink(ctx);
    });
    this.mesh = s.sprite(GOAL_W, paintMesh);
    this.body = [MINE, THEIRS].map((c) => s.sprite(2 * MALLET_R + 3, (ctx) => paintBody(ctx, c)));
    this.knob = [MINE, THEIRS].map((c) => s.sprite(9, (ctx) => paintKnob(ctx, c)));
    this.flash = s.sprite(2 * MALLET_R + 3, paintFlash);
    this.pucks = [0, 1, 2, 3].map((h) => s.sprite(2 * PUCK_R + 3, (ctx) => paintPuck(ctx, h)));
    this.shadeM = s.sprite(2 * MALLET_R + 1, (ctx) => paintShadow(ctx, MALLET_R));
    this.shadeP = s.sprite(2 * PUCK_R + 1, (ctx) => paintShadow(ctx, PUCK_R));
  }

  /** Where a pointer is over the ice, in the game's units. */
  at(e: { clientX: number; clientY: number }): Spot {
    const p = this.screen.at(e);
    return { x: p.x - SIDE, y: p.y - END };
  }

  /** How far above a finger its mallet rides, in units: far enough that the finger never hides it. */
  lifted(): number {
    const shown = this.screen.canvas.clientWidth || FULL_W * 3;
    return clamp((56 * FULL_W) / shown, 9, 20);
  }

  /** The rink's lights come on: the tube runs round from both nets. */
  lightsOn(now: number) {
    this.litAt = now;
    for (const [x, y, side] of [
      [W / 2, 0, "top"],
      [W / 2, H, "bottom"],
    ] as const) {
      this.pulses.push({ at: railOf(x, y, side), t0: now, life: 520, reach: RAIL_LEN / 4, tail: 30, color: "#ffffff", a: 0.9 });
    }
  }

  /** Who is a goal from winning; the rink dims and holds its breath. */
  point(mine: boolean, theirs: boolean) {
    this.tense = { mine, theirs };
    this.lift = mine || theirs ? 0.06 : 0;
  }

  /** The puck got warmer. */
  warm(level: number, now: number) {
    this.heatAt = now;
    if (!this.had) return;
    const color = HEAT_GLOW[level];
    this.rings.push({ x: this.px, y: this.py, t0: now, life: 420, r0: 4, r1: 16 + level * 3, color, a: 0.9 });
    this.sparks.burst(this.px, this.py, 8 + level * 4, 0.07, [color, "#ffffff"], { life: 420 });
  }

  /**
   * A goal. `mine` when this viewer scored, `last` when it ends the match. The moment is held for a few frames,
   * then the light, the sparks and the shake; the ice is wiped before the next puck, or the winner is left to it.
   */
  goal(mine: boolean, now: number, last: boolean) {
    const y = mine ? 0 : H;
    const color = mine ? MINE : THEIRS;
    const quiet = calm();
    const freeze = quiet ? 0 : last ? FREEZE_LAST_MS : FREEZE_MS;
    const out = mine ? Math.PI / 2 : -Math.PI / 2;
    this.beat = { t0: now, mine, last, y, freeze };
    this.freezeEnd = now + freeze;
    this.tLen = 0;
    this.jolt.flash("#ffffff", last ? 0.5 : 0.24, freeze + 140, now);
    if (this.ghost && last) this.ghost.until = Infinity;
    this.cues.at(now + freeze, () => {
      const t = now + freeze;
      const x = clamp(this.ghost?.x ?? W / 2, MOUTH + PUCK_R, MOUTH + GOAL_W - PUCK_R);
      this.sparks.burst(x, y, last ? 70 : 44, 0.14, [color, "#ffffff", shade(color, 1.3)], {
        dir: out,
        spread: 2.6,
        life: 760,
        size: 1.2,
        drag: 0.994,
      });
      this.sparks.burst(x, y, 16, 0.07, CHIPS, { dir: out, spread: 3, life: 520 });
      this.rings.push({ x, y, t0: t, life: 520, r0: 6, r1: 34, color, a: 0.8 });
      this.jolt.shake(last ? 3.6 : 2.6, last ? 620 : 420, t);
      this.jolt.flash(color, last ? 0.3 : 0.22, last ? 480 : 320, t);
      this.pulses.push({ at: railOf(x, y, mine ? "top" : "bottom"), t0: t, life: 680, reach: RAIL_LEN / 2, tail: 40, color: "#ffffff", a: 1 });
      if (last) this.cannons(color);
    });
    if (last) {
      this.won = { t0: now, mine };
      this.cues.at(now + freeze + 520, () => this.cannons(color));
    } else this.wipe = { t0: now + WIPE_AT, dir: mine ? 1 : -1, begun: false };
  }

  /** Paper out of the boards on both sides, in the winner's colour. */
  private cannons(color: string) {
    if (calm()) return;
    const colors = [color, color, shade(color, 1.25), ...PAPER];
    for (const y of [H * 0.2, H * 0.5, H * 0.8]) {
      for (const [x, dir] of [
        [-2, 0],
        [W + 2, Math.PI],
      ]) {
        this.paper.burst(x, y, 22, 0.17, colors, { dir, spread: 1.7, life: 2800, size: 1.5, fall: 0.00005, drag: 0.9955 });
      }
    }
  }

  /** The puck's sudden turns: a mallet, the boards, a post; a new puck landing; the old one going in. */
  private watch(f: Look, now: number) {
    const p = f.puck;
    if (!p) {
      if (this.had) {
        const top = this.py < H / 2;
        const near = top ? this.py < PUCK_R + 4 : this.py > H - PUCK_R - 4;
        if (near && Math.abs(this.px - W / 2) < GOAL_W / 2) {
          // the last puck of a match stays where it went in
          this.ghost = { x: this.px, y: this.py, vx: this.pvx, vy: this.pvy, top, heat: this.pheat, until: this.won ? Infinity : now + 1900 };
        }
      }
      this.had = false;
      this.due = f.dropIn >= 0;
      return;
    }
    const speed = Math.hypot(p.vx, p.vy);
    if (!this.had) {
      this.ghost = null;
      this.tLen = 0;
      // a new puck comes down on the ice; one that is only back after a wrong guess does so quietly
      if (this.due) {
        this.rings.push({ x: p.x, y: p.y, t0: now, life: 340, r0: 4, r1: 13, color: "#ffffff", a: 0.8 });
        this.sparks.burst(p.x, p.y, 12, 0.05, CHIPS, { life: 320 });
        this.jolt.shake(0.6, 110, now);
        sndDrop();
      }
    } else {
      const dvx = p.vx - this.pvx;
      const dvy = p.vy - this.pvy;
      const dv = Math.hypot(dvx, dvy);
      const moved = Math.hypot(p.x - this.px, p.y - this.py);
      if (speed > 0.03 && moved < 12) this.marks.line(this.px, this.py, p.x, p.y, 0.06 + 0.1 * Math.min(1, speed / 0.3), 0.5);
      if (dv > 0.03) {
        const dm = Math.hypot(p.x - f.mine.x, p.y - f.mine.y);
        const dt = Math.hypot(p.x - f.theirs.x, p.y - f.theirs.y);
        const near = Math.min(dm, dt);
        const reach = PUCK_R + MALLET_R;
        const side = p.vx * this.pvx < 0 && (this.pvx > 0 ? p.x > W - PUCK_R - 7 : p.x < PUCK_R + 7);
        const end = p.vy * this.pvy < 0 && (this.pvy > 0 ? p.y > H - PUCK_R - 7 : p.y < PUCK_R + 7);
        if (near < reach + 4 || (!side && !end && near < reach + 12)) this.struck(dm <= dt ? 0 : 1, p, f, dv, now);
        else if ((side || end) && speed > 0.02) this.bounced(p, side, end, speed, now);
      }
    }
    this.had = true;
    this.px = p.x;
    this.py = p.y;
    this.pvx = p.vx;
    this.pvy = p.vy;
    this.pheat = f.heat;
  }

  /** A mallet met the puck: sparks and a ring where they touched, the mallet thrown back a little, a shake if hard. */
  private struck(who: number, p: Moving, f: Look, dv: number, now: number) {
    const m = who === 0 ? f.mine : f.theirs;
    const color = who === 0 ? MINE : THEIRS;
    const power = Math.min(1, dv / 0.34);
    const a = Math.atan2(p.y - m.y, p.x - m.x);
    const cx = m.x + Math.cos(a) * MALLET_R;
    const cy = m.y + Math.sin(a) * MALLET_R;
    this.sparks.burst(cx, cy, 4 + Math.round(power * 12), 0.04 + power * 0.09, [color, "#ffffff"], {
      dir: a,
      spread: 2.1,
      life: 250 + power * 130,
    });
    this.rings.push({ x: cx, y: cy, t0: now, life: 150 + power * 110, r0: 2, r1: 4 + power * 5, color: "#ffffff", a: 0.35 + 0.55 * power });
    this.marks.nick(cx, cy, 0.25 + power * 0.4);
    const h = this.hands[who];
    h.hitAt = now;
    h.power = power;
    h.kx = -Math.cos(a);
    h.ky = -Math.sin(a);
    if (power > 0.72) this.jolt.shake(0.5 + power * 0.7, 130, now);
    if (now - this.hitAt > CLICK_MS) {
      this.hitAt = now;
      sndTap(power);
    }
  }

  /** The puck came off the boards: ice chips, a light running along the tube, the post if it was that close. */
  private bounced(p: Moving, side: boolean, end: boolean, speed: number, now: number) {
    const f = Math.min(1, speed / 0.3);
    const color = this.pheat ? HEAT_GLOW[this.pheat] : "#ffffff";
    let post = false;
    const hit = (x: number, y: number, dir: number, wall: "top" | "right" | "bottom" | "left") => {
      this.sparks.burst(x, y, 3 + Math.round(f * 8), 0.03 + f * 0.07, CHIPS, { dir, spread: 2.4, life: 200 + f * 160 });
      this.marks.nick(clamp(x, 1, W - 1), clamp(y, 1, H - 1), 0.2 + f * 0.3);
      this.pulses.push({ at: railOf(x, y, wall), t0: now, life: 260 + f * 160, reach: 14 + f * 34, tail: 7, color, a: 0.5 + 0.5 * f });
    };
    if (side) {
      const right = this.pvx > 0;
      hit(right ? W : 0, p.y, right ? Math.PI : 0, right ? "right" : "left");
    }
    if (end) {
      const low = this.pvy > 0;
      hit(p.x, low ? H : 0, low ? -Math.PI / 2 : Math.PI / 2, low ? "bottom" : "top");
      const off = Math.abs(p.x - W / 2) - GOAL_W / 2;
      if (off >= 0 && off < PUCK_R + 2.5) {
        post = true;
        this.postAt[low ? 1 : 0] = now;
        this.rings.push({ x: W / 2 + Math.sign(p.x - W / 2) * (GOAL_W / 2 + 1), y: low ? H : 0, t0: now, life: 260, r0: 2, r1: 9, color: "#ffffff", a: 0.9 });
      }
    }
    if (now - this.wallAt > CLICK_MS) {
      this.wallAt = now;
      if (post) sndPost();
      else sndClack(f, this.lift + this.pheat * 0.04);
    }
  }

  /** Where a mallet is drawn: held still through a freeze, eased back after, and on a slow lap once it has won. */
  private place(who: number, live: Spot, now: number, dt: number, held: boolean): Hand {
    const h = this.hands[who];
    if (!h.seen) {
      h.x = live.x;
      h.y = live.y;
      h.seen = true;
    }
    if (held) return h;
    let { x, y } = live;
    const w = this.won;
    if (w && (who === 0) === w.mine && !calm()) {
      const e = now - w.t0 - LAP_AT;
      if (e > 0) {
        const r = 5 * Math.min(1, e / 900);
        x += Math.sin(e / 420) * r;
        y += (Math.cos(e / 420) - 1) * r * 0.8;
      }
    }
    const since = now - this.freezeEnd;
    const k = since < THAW_MS ? 0.3 + (0.7 * since) / THAW_MS : 1;
    const nx = h.x + (x - h.x) * k;
    const ny = h.y + (y - h.y) * k;
    const vx = (nx - h.x) / dt;
    const vy = (ny - h.y) / dt;
    h.vx += (vx - h.vx) * 0.4;
    h.vy += (vy - h.vy) * 0.4;
    if (!w && Math.hypot(nx - h.x, ny - h.y) > 0.25) this.marks.line(h.x, h.y, nx, ny, 0.025, 1.5);
    h.x = nx;
    h.y = ny;
    return h;
  }

  /** how far the rink's lights are up, 0 to 1: they flicker on before the first puck */
  private lamps(now: number): number {
    const e = now - this.litAt;
    if (e < 0) return 0;
    if (calm() || e >= 300) return 1;
    return e < 70 ? 0.6 : e < 150 ? 0.15 : e < 230 ? 0.8 : 0.45;
  }

  private enter(ctx: Ctx, dx: number, dy: number) {
    const k = this.screen.k;
    const z = this.zoom;
    const cx = W / 2 + SIDE;
    const cy = this.zy + END;
    ctx.setTransform(k * z, 0, 0, k * z, Math.round((SIDE + dx - cx) * k * z + cx * k), Math.round((END + dy - cy) * k * z + cy * k));
  }

  /** One frame. */
  frame(ctx: Ctx, now: number, f: Look) {
    const s = this.screen;
    if (s.takeResize()) this.paint();
    const dt = this.prev ? Math.min(100, Math.max(1, now - this.prev)) : 16;
    this.prev = now;
    const quiet = calm();
    const held = now < this.freezeEnd;
    this.watch(f, now);
    this.cues.run(now);
    if (!held) {
      this.sparks.step(dt);
      this.paper.step(dt);
    }
    this.jolt.update(now);
    this.marks.wear(now);
    const { dx, dy } = this.jolt;
    const b = this.beat;
    const since = b ? now - b.t0 : Infinity;

    // the last goal leans in toward the net for as long as the moment is held
    this.zoom = 1;
    if (b?.last && !quiet) {
      this.zy = b.y;
      if (since < b.freeze) this.zoom = 1 + 0.06 * easeOut(since / b.freeze);
      else if (since < b.freeze + 380) this.zoom = 1 + 0.06 * (1 - easeOut((since - b.freeze) / 380));
    }

    const k = s.k;
    const z = this.zoom;
    const cx = (W / 2 + SIDE) * k;
    const cy = (this.zy + END) * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
    ctx.setTransform(z, 0, 0, z, Math.round(dx * k * z + cx * (1 - z)), Math.round(dy * k * z + cy * (1 - z)));
    ctx.drawImage(this.bg, 0, 0);
    this.enter(ctx, dx, dy);

    const mine = this.place(0, f.mine, now, dt, held);
    const theirs = this.place(1, f.theirs, now, dt, held);
    const lights = this.lamps(now);
    const lit = b !== null && since >= b.freeze && (b.last || since < LIT_MS);
    const goalColor = b?.mine ? MINE : THEIRS;

    this.marks.draw(ctx, 0.55);
    this.resurface(ctx, now);

    // the tube round the boards: the house violet, the puck's heat, a match point's colour, a goal's strobe
    let tube: string = TUBE[f.heat];
    let ta = 1;
    if (now - this.heatAt < 150 && !quiet) tube = "#ffffff";
    else if (lit) {
      tube = goalColor;
      ta = quiet ? 1 : b?.last && since > 1700 ? 0.75 + 0.25 * Math.sin(now / 420) : 0.5 + 0.5 * (Math.floor(now / 75) % 2);
    } else if (f.heat > 0) ta = quiet ? 1 : 0.74 + 0.26 * Math.sin(now / (250 - f.heat * 50));
    else if (this.tense.mine || this.tense.theirs) {
      tube = this.tense.mine && this.tense.theirs ? PINK : this.tense.mine ? MINE : THEIRS;
      ta = quiet ? 1 : 0.62 + 0.38 * Math.sin(now / 300);
    }
    ta *= lights;
    if (ta > 0.01) {
      ctx.globalAlpha = ta;
      ctx.fillStyle = tube;
      for (const [x, y, w, h] of TUBE_RUNS) ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      const ga = ta * (f.heat || lit ? 0.62 : 0.42);
      tubeGlow(ctx, tube, -3, -7, W + 6, 11, ga);
      tubeGlow(ctx, tube, -3, H - 4, W + 6, 11, ga);
      tubeGlow(ctx, tube, -7, -3, 11, H + 6, ga, true);
      tubeGlow(ctx, tube, W - 4, -3, 11, H + 6, ga, true);
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      const t = (now - p.t0) / p.life;
      if (t >= 1) {
        this.pulses.splice(i, 1);
        continue;
      }
      if (t < 0) continue;
      const d = 1 + t * p.reach;
      ctx.fillStyle = p.color;
      for (let j = 0; j < p.tail; j++) {
        ctx.globalAlpha = p.a * (1 - t) * (1 - j / p.tail);
        for (const dir of [-1, 1]) {
          const cell = railAt(p.at + dir * (d - j));
          if (cell && d - j >= 0) ctx.fillRect(cell[0], cell[1], 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    }

    this.nets(ctx, now, dt, held, lit, goalColor, quiet);

    // a goal's light: a glow at the net and a beacon turning over the ice; later the winner's slow spotlights
    if (b && lit) {
      const span = b.last ? 1700 : LIT_MS;
      const fade = clamp((span - since) / 320, 0, 1);
      glow(ctx, W / 2, b.y, 34, goalColor, fade * (quiet ? 0.45 : 0.5 + 0.25 * Math.sin(now / 48)));
      if (!quiet && fade > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.clip();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rgba(goalColor, 0.13 * fade);
        const turn = ((since - b.freeze) / 1000) * TAU * 1.3;
        for (let i = 0; i < 2; i++) {
          const a = turn + i * Math.PI;
          ctx.beginPath();
          ctx.moveTo(W / 2, b.y);
          ctx.lineTo(W / 2 + Math.cos(a - 0.2) * 190, b.y + Math.sin(a - 0.2) * 190);
          ctx.lineTo(W / 2 + Math.cos(a + 0.2) * 190, b.y + Math.sin(a + 0.2) * 190);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
    const w = this.won;
    if (w) {
      const e = now - w.t0 - 1300;
      if (e > 0) {
        const up = Math.min(1, e / 600) * 0.2;
        const color = w.mine ? MINE : THEIRS;
        for (let i = 0; i < 2; i++) {
          const t = quiet ? i * 2 : e / 1000 + i * 2.2;
          const x = W / 2 + Math.sin(t * 0.62 + i) * 27;
          const y = H / 2 + Math.cos(t * 0.41 + i * 1.3) * 50;
          beam(ctx, i ? "#ffffff" : color, x - 30, y - 30, 60, 60, up * (i ? 0.7 : 1));
        }
        if (!quiet && now - this.paperAt > 150) {
          this.paperAt = now;
          this.paper.burst(Math.random() * W, -END, 2, 0.03, [color, shade(color, 1.25), ...PAPER], {
            dir: Math.PI / 2,
            spread: 1.3,
            life: 4600,
            size: 1.4,
            fall: 0.00004,
            drag: 0.998,
          });
        }
      }
    }

    // a match point: the hall dims round the ice, and the net that would end it glows
    if ((this.tense.mine || this.tense.theirs) && !w) {
      ctx.globalAlpha = quiet ? 0.5 : 0.46 + 0.14 * Math.sin(now / 420);
      ctx.drawImage(this.dusk, 0, 0, W, H);
      ctx.globalAlpha = 1;
      const beat = quiet ? 0.28 : 0.24 + 0.16 * Math.sin(now / 260);
      if (this.tense.mine) glow(ctx, W / 2, 0, 26, MINE, beat);
      if (this.tense.theirs) glow(ctx, W / 2, H, 26, THEIRS, beat);
    }

    // the next puck: a ring closing on its mark, then the puck coming down
    const falling = f.dropIn >= 0 && f.dropIn < FALL_MS;
    if (f.dropIn >= 0 && f.dropIn < RING_MS && lights > 0) {
      const t = 1 - f.dropIn / RING_MS;
      ctx.globalAlpha = 0.25 + 0.6 * t;
      ring(ctx, f.drop.x, f.drop.y, Math.round(15 - 9 * t), "#ffffff");
      ctx.globalAlpha = 0.5 * t;
      ring(ctx, f.drop.x, f.drop.y, Math.round(18 - 9 * t), PINK);
      ctx.globalAlpha = 1;
    }

    // shadows first, so nothing ever stands on another's shadow
    ctx.globalAlpha = 0.42;
    for (const m of [theirs, mine]) s.stamp(ctx, this.shadeM, m.x + 1.2 - clamp(m.vx * 3, -0.8, 0.8), m.y + 2.2 - clamp(m.vy * 3, -0.8, 0.8));
    const p = held ? null : f.puck;
    if (p) s.stamp(ctx, this.shadeP, p.x + 1, p.y + 1.6);
    ctx.globalAlpha = 1;

    glow(ctx, theirs.x, theirs.y, 13, THEIRS, 0.2);
    glow(ctx, mine.x, mine.y, 13, MINE, 0.2);

    // the puck's streak: longer and brighter the faster it goes, in the colour of its heat
    if (p) {
      this.tx[this.tAt] = p.x;
      this.ty[this.tAt] = p.y;
      this.tAt = (this.tAt + 1) % TRAIL;
      this.tLen = Math.min(TRAIL, this.tLen + 1);
      const speed = Math.hypot(p.vx, p.vy);
      const n = Math.min(this.tLen, 3 + Math.floor((speed / 0.35) * (TRAIL - 3)));
      const a = Math.min(0.6, speed * 3.2);
      if (a > 0.02 && n > 1) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = HEAT_TRAIL[f.heat];
        for (let i = 0; i < n; i++) {
          const j = (this.tAt - 1 - i + 2 * TRAIL) % TRAIL;
          const t = 1 - i / n;
          const size = PUCK_R * 1.8 * (0.3 + 0.7 * t);
          ctx.globalAlpha = a * t * t;
          ctx.fillRect(s.snap(this.tx[j] - size / 2), s.snap(this.ty[j] - size / 2), size, size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      // a warm puck sheds embers as it goes
      if (f.heat >= 2 && speed > 0.05 && now - this.emberAt > (f.heat === 3 ? 26 : 60)) {
        this.emberAt = now;
        this.sparks.burst(p.x, p.y, 1, 0.025, [HEAT_TRAIL[f.heat], "#ffffff"], { life: 380 });
      }
    }

    this.mallet(ctx, 1, theirs, now);
    this.mallet(ctx, 0, mine, now);

    if (p) {
      const speed = Math.hypot(p.vx, p.vy);
      const spr = this.pucks[f.heat];
      // it stretches along its way when it flies
      if (speed > 0.11) {
        const far = Math.min(1, (speed - 0.11) / 0.2);
        ctx.globalAlpha = 0.22 + 0.2 * far;
        s.stamp(ctx, spr, p.x - p.vx * (9 + 9 * far), p.y - p.vy * (9 + 9 * far));
        ctx.globalAlpha = 0.45 + 0.2 * far;
        s.stamp(ctx, spr, p.x - p.vx * (4 + 5 * far), p.y - p.vy * (4 + 5 * far));
        ctx.globalAlpha = 1;
      }
      const hot = f.heat === 3 && !quiet ? 0.5 + 0.14 * Math.sin(now / 40) : [0.16, 0.3, 0.42, 0.5][f.heat];
      glow(ctx, p.x, p.y, 9 + f.heat * 2, HEAT_GLOW[f.heat], hot);
      s.stamp(ctx, spr, p.x, p.y);
    } else if (falling) {
      const t = 1 - f.dropIn / FALL_MS;
      const down = t * t;
      const size = (this.pucks[0].width / k) * (1.9 - 0.9 * down);
      ctx.globalAlpha = 0.12 + 0.3 * down;
      s.stamp(ctx, this.shadeP, f.drop.x + 1 + 3 * (1 - down), f.drop.y + 1.6 + 5 * (1 - down));
      ctx.globalAlpha = Math.min(1, t * 3);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.pucks[0], f.drop.x - size / 2, f.drop.y - 4 * (1 - down) - size / 2, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      const t = (now - r.t0) / r.life;
      if (t >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      if (t < 0) continue;
      ctx.globalAlpha = r.a * (1 - t);
      ring(ctx, r.x, r.y, r.r0 + (r.r1 - r.r0) * easeOut(t), r.color);
    }
    ctx.globalAlpha = 1;
    this.sparks.draw(ctx, s);

    // where the hand is, when the mallet is not there: a mouse out ahead of it, a finger under it
    if (f.finger && !w) {
      const fx = f.finger.x;
      const fy = f.finger.y;
      const d = Math.hypot(fx - mine.x, fy - mine.y);
      ctx.fillStyle = MINE;
      for (let u = MALLET_R + 2; u < d - 2; u += 3) {
        ctx.globalAlpha = 0.34;
        ctx.fillRect(s.snap(mine.x + ((fx - mine.x) * u) / d - 0.5), s.snap(mine.y + ((fy - mine.y) * u) / d - 0.5), 1, 1);
      }
      ctx.globalAlpha = 0.3;
      ring(ctx, fx, fy, 6, MINE);
      ctx.globalAlpha = 1;
    } else if (f.aim && !w && Math.hypot(f.aim.x - mine.x, f.aim.y - mine.y) > 3) {
      const ax = s.snap(f.aim.x);
      const ay = s.snap(f.aim.y);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = INK;
      ctx.fillRect(ax - 3, ay - 1, 6, 2);
      ctx.fillRect(ax - 1, ay - 3, 2, 6);
      ctx.fillStyle = MINE;
      ctx.fillRect(ax - 2.5, ay - 0.5, 2, 1);
      ctx.fillRect(ax + 0.5, ay - 0.5, 2, 1);
      ctx.fillRect(ax - 0.5, ay - 2.5, 1, 2);
      ctx.fillRect(ax - 0.5, ay + 0.5, 1, 2);
      ctx.globalAlpha = 1;
    }

    this.paper.draw(ctx, s);

    if (lights < 1) {
      ctx.globalAlpha = (1 - lights) * 0.62;
      ctx.fillStyle = INK;
      ctx.fillRect(-SIDE, -END, FULL_W, FULL_H);
      ctx.globalAlpha = 1;
    }
    this.jolt.overlay(ctx, -SIDE - 8, -END - 8, FULL_W + 16, FULL_H + 16, now);
  }

  /** A mallet: its body, the knob leaning the way it moves and thrown back by a strike, its rim white as it strikes. */
  private mallet(ctx: Ctx, who: number, m: Hand, now: number) {
    const s = this.screen;
    const e = now - m.hitAt;
    const kick = e < 150 ? (1 - e / 150) * m.power * 1.8 : 0;
    s.stamp(ctx, this.body[who], m.x, m.y);
    s.stamp(ctx, this.knob[who], m.x + clamp(m.vx * 7, -1.6, 1.6) + m.kx * kick, m.y + clamp(m.vy * 7, -1.6, 1.6) + m.ky * kick);
    if (e < 120) {
      const a = (1 - e / 120) * (0.35 + 0.65 * m.power);
      ctx.globalAlpha = a;
      s.stamp(ctx, this.flash, m.x, m.y);
      ctx.globalAlpha = 1;
      glow(ctx, m.x, m.y, 16, "#ffffff", a * 0.4);
    }
  }

  /** Both nets: the goal lines in their colours, the puck that went in, the mesh over it, a post that just rang. */
  private nets(ctx: Ctx, now: number, dt: number, held: boolean, lit: boolean, goalColor: string, quiet: boolean) {
    const k = this.screen.k;
    const b = this.beat;
    const g = this.ghost;
    if (g && !held) {
      if (now > g.until) this.ghost = null;
      else {
        const rest = g.top ? -4 : H + 4;
        g.x += g.vx * dt;
        g.vx *= Math.pow(0.99, dt);
        if (g.x < MOUTH + PUCK_R) {
          g.x = MOUTH + PUCK_R;
          g.vx = Math.abs(g.vx) * 0.4;
        } else if (g.x > MOUTH + GOAL_W - PUCK_R) {
          g.x = MOUTH + GOAL_W - PUCK_R;
          g.vx = -Math.abs(g.vx) * 0.4;
        }
        g.y += (rest - g.y) * Math.min(1, dt / 70);
      }
    }
    for (const top of [true, false]) {
      const y0 = top ? -END + 1 : H;
      const here = b !== null && b.y === (top ? 0 : H);
      const since = b ? now - b.t0 : Infinity;
      if (g && this.ghost && g.top === top) {
        ctx.globalAlpha = clamp((g.until - now) / 260, 0, 1);
        this.screen.stamp(ctx, this.pucks[g.heat], g.x, g.y);
        ctx.globalAlpha = 1;
      }
      // the mesh, shaken by the puck for a moment
      const shake = here && b && since < b.freeze + 420 && !quiet ? 1.3 * (1 - Math.max(0, since - b.freeze) / 420) : 0;
      if (shake > 0.05) {
        for (let x = 0; x < GOAL_W; x += 4) {
          const off = Math.sin((x - (g?.x ?? W / 2) + MOUTH) * 0.45 + since * 0.035) * shake;
          ctx.drawImage(this.mesh, x * k, 0, 4 * k, (END - 1) * k, MOUTH + x, y0 + (top ? Math.min(0, off) : Math.max(0, off)), 4, END - 1);
        }
      } else ctx.drawImage(this.mesh, 0, 0, GOAL_W * k, (END - 1) * k, MOUTH, y0, GOAL_W, END - 1);
      // the line: this end's own colour, or the scorer's while the light is on; white as the puck goes in
      let color = top ? THEIRS : MINE;
      let a = 0.5;
      if (here && b && since < b.freeze) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(MOUTH, y0, GOAL_W, END - 1);
        ctx.globalAlpha = 1;
        color = "#ffffff";
        a = 1;
      } else if (here && lit) {
        const on = quiet || Math.floor(now / 75) % 2 === 0;
        ctx.globalAlpha = on ? 0.4 : 0.12;
        ctx.fillStyle = goalColor;
        ctx.fillRect(MOUTH, y0, GOAL_W, END - 1);
        ctx.globalAlpha = 1;
        color = on ? goalColor : "#ffffff";
        a = 0.9;
      }
      ctx.fillStyle = color;
      ctx.fillRect(MOUTH, top ? -1 : H, GOAL_W, 1);
      tubeGlow(ctx, color, MOUTH - 2, top ? -4.5 : H - 3.5, GOAL_W + 4, 8, a * this.lamps(now));
      const rang = now - this.postAt[top ? 0 : 1];
      if (rang < 180) {
        ctx.globalAlpha = 1 - rang / 180;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(MOUTH - 3, top ? -3 : H, 4, 3);
        ctx.fillRect(MOUTH + GOAL_W - 1, top ? -3 : H, 4, 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** The ice wiped clean between goals: a bright bar across it, the scratches gone behind. */
  private resurface(ctx: Ctx, now: number) {
    const w = this.wipe;
    if (!w) return;
    const e = now - w.t0;
    if (e < 0) return;
    if (!w.begun) {
      w.begun = true;
      sndSweep();
      if (this.ghost) this.ghost.until = Math.min(this.ghost.until, now + 260);
    }
    const t = Math.min(1, e / WIPE_MS);
    const y = w.dir > 0 ? t * H : H - t * H;
    this.marks.wipe(w.dir > 0 ? 0 : y, w.dir > 0 ? y : H);
    if (t >= 1) {
      this.marks.clear();
      this.wipe = null;
      return;
    }
    ctx.fillStyle = "#cfeaff";
    for (let i = 1; i < 18; i++) {
      const row = Math.round(y) - w.dir * i;
      if (row < 0 || row >= H) continue;
      ctx.globalAlpha = 0.17 * (1 - i / 18);
      ctx.fillRect(0, row, W, 1);
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#f2fbff";
    ctx.fillRect(0, clamp(Math.round(y), 0, H - 1), W, 1);
    ctx.globalAlpha = 1;
    tubeGlow(ctx, "#bfe6ff", 0, clamp(y, 4, H - 4) - 4, W, 8, 0.45);
    if (Math.random() < 0.6) this.sparks.burst(Math.random() * W, clamp(y, 1, H - 1), 1, 0.02, CHIPS, { life: 260 });
  }

  dispose() {
    this.screen.dispose();
  }
}
