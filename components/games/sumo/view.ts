"use client";

import { BODY_R, C, FLOE_R } from "@/lib/live/sumo";
import { sumoSfx } from "@/lib/live/sounds/sumo";
import { INTRO_MS, KICKOFF_MS } from "../beats";
import { Cues, Jolt } from "../fx";
import { Floe } from "./floe";
import { Fx } from "./particles";
import { Ctx, INK, PX, Stage, calm, clamp, dot, ease, easeOut, hash, lerp, stamp } from "./pixels";
import { SEA, Sea } from "./sea";
import { DROP, Hands, MID, Mood, Pose, R, drawFrozen, drawWrestler } from "./wrestler";

/*
 * The floe as one viewer sees it, and everything that is staged on it. The game says where the wrestlers are, who
 * dashed, who hit whom and who went in; this turns it into a picture with weight: faces, squash and stretch, a held
 * frame on a hard hit, the fall, the splash and the block of ice, the ceremony before each bout and the last ring-out.
 * It keeps its own clock and its own small state, and never writes to the game.
 */

/** how far apart two wrestlers' spots are when they touch, art pixels */
const TOUCH = 2 * BODY_R * PX;
/** a hit this hard or harder (the speed two wrestlers close at, units/ms) is felt; this hard, it stops the picture */
const FELT = 0.06;
const HARD = 0.2;
/** bumps sound at most this often, ms; the lightest of them, under SHOVE, more seldom still */
const BUMP_MS = 120;
const SHOVE = 0.12;
const SHOVE_MS = 260;
/** through the air off the edge, under the water, and up out of it again, ms; the match's last fall takes its time */
const AIR_MS = 270;
const AIR_LAST_MS = 540;
const UNDER_MS = 400;
const RISE_MS = 240;
/** the jump back onto the ice before the next round */
const BACK_MS = 400;
/** the ice of a new round spreads back out to its full size in this long */
const GROW_MS = 380;
/** the stomp: a foot up this long, then down */
const STOMP_MS = 200;
/** the last ring-out is looked at closer, this much */
const ZOOM = 0.16;
const CONFETTI = ["#ffffff", "#ffd25a", "#ff7aa8", "#7ef0c2"];
const DIZZY = [".K.", "KKK", ".K."];
const POINTER = ["KKKKK", ".KKK.", "..K.."];

/** One wrestler as the game has them this frame, on this viewer's screen: game units and units/ms. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fell: boolean;
  /** share of the dash that is back */
  ready: number;
}

/** What the view asks of the page round the canvas: its words are text, so they are the page's to show. */
export interface Signs {
  /** the plate at the top: the round's number, and whether one more round can take the match */
  banner(round: number, point: boolean): void;
  /** the word a bout starts on */
  go(): void;
  /** a splash, at these shares of the stage's width and height; `big` for the one that ends the match */
  splash(x: number, y: number, big: boolean): void;
  /** the floe has started to melt */
  melt(): void;
}

interface Fall {
  at: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  air: number;
  big: boolean;
  wet: boolean;
  up: boolean;
}

interface Enter {
  at: number;
  x0: number;
  y0: number;
  ms: number;
  high: number;
  /** leaves a block of ice behind */
  iced: boolean;
  begun: boolean;
}

interface Jump {
  at: number;
  ms: number;
  high: number;
  landed: boolean;
}

interface Actor {
  color: string;
  me: boolean;
  /** where they start a round, art pixels from the middle */
  hx: number;
  hy: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  lx: number;
  ly: number;
  /** the body's spring: how squashed it is along (ax, ay), and how fast that is changing */
  s: number;
  sv: number;
  ax: number;
  ay: number;
  walk: number;
  blinkAt: number;
  strain: number;
  panic: number;
  dizzyUntil: number;
  joyUntil: number;
  sulkUntil: number;
  flashUntil: number;
  dashAt: number;
  stompAt: number;
  crouch: boolean;
  chill: number;
  fall: Fall | null;
  enter: Enter | null;
  jump: Jump | null;
  crumbAt: number;
  sweatAt: number;
  steamAt: number;
  /** the other wrestler they are pushing against, or -1 */
  against: number;
  shown: boolean;
}

export class SumoView {
  readonly stage: Stage;
  private readonly sea = new Sea();
  private readonly floe = new Floe();
  private readonly fx = new Fx();
  private readonly jolt = new Jolt();
  private readonly cues = new Cues();
  private readonly actors: Actor[];
  private readonly me: number;
  private back: HTMLCanvasElement | null = null;
  private prev = 0;
  private roundNo = 0;
  private goAt = Infinity;
  private point = false;
  private live = false;
  /** a held frame after a hard hit: until when, and where everybody was */
  private holdUntil = 0;
  private readonly held: number[];
  private bumpAt = 0;
  private creakAt = 0;
  private plipAt = 0;
  private denyAt = 0;
  private melting = false;
  private chunkR = FLOE_R;
  /** the floe's radius as last drawn, art pixels, and the new round's ice still spreading out to its full size */
  private shownR = FLOE_R * PX;
  private grow: { at: number; from: number } | null = null;
  private heat = 0;
  private cheer = 0;
  private over: { at: number; who: number } | null = null;
  private zoom: { at: number; x: number; y: number } | null = null;
  private dripAt = 0;
  private seed = 1;
  /** what the game said happened since the last frame, staged once this frame knows how everybody moves now */
  private todo: (() => void)[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    colors: readonly string[],
    me: number,
    /** where each seat starts on this viewer's screen, game units */
    homes: readonly { x: number; y: number }[],
    private readonly signs: Signs,
  ) {
    this.stage = new Stage(canvas);
    this.me = me;
    this.held = homes.flatMap(() => [0, 0]);
    this.actors = homes.map((h, k) => {
      const hx = (h.x - C) * PX;
      const hy = (h.y - C) * PX;
      const d = Math.sqrt(hx * hx + hy * hy) || 1;
      return {
        color: colors[k],
        me: k === me,
        hx,
        hy,
        x: hx,
        y: hy,
        z: 0,
        vx: 0,
        vy: 0,
        lx: -hx / d,
        ly: -hy / d,
        s: 0,
        sv: 0,
        ax: 0,
        ay: 1,
        walk: -1,
        blinkAt: 1500 + k * 700,
        strain: 0,
        panic: 0,
        dizzyUntil: 0,
        joyUntil: 0,
        sulkUntil: 0,
        flashUntil: 0,
        dashAt: -1e9,
        stompAt: -1e9,
        crouch: false,
        chill: 0,
        fall: null,
        enter: null,
        jump: null,
        crumbAt: 0,
        sweatAt: 0,
        steamAt: 0,
        against: -1,
        shown: false,
      };
    });
  }

  private rnd(): number {
    return hash(this.seed++);
  }

  /** The body's spring pushed in along (ax, ay): `by` under 0 squashes it flat along that way. */
  private press(a: Actor, ax: number, ay: number, by: number) {
    if (Math.abs(by) < Math.abs(a.s)) return;
    a.ax = ax;
    a.ay = ay;
    a.s = by;
    a.sv = 0;
  }

  /**
   * A new round: the ones who fell jump back on, everybody stomps and crouches, and at `goAt` they are off. `first`
   * is the match's own opening, with the intro before it; `point` says one more round can take the match.
   */
  round(now: number, goAt: number, n: number, first: boolean, point: boolean) {
    this.cues.clear();
    this.floe.reset();
    this.roundNo = n;
    this.goAt = goAt;
    this.point = point;
    this.live = false;
    this.melting = false;
    this.chunkR = FLOE_R;
    this.holdUntil = 0;
    this.grow = first ? null : { at: now, from: this.shownR };
    const count = this.actors.length;
    this.actors.forEach((a, k) => {
      a.dizzyUntil = a.joyUntil = 0;
      a.strain = a.panic = 0;
      a.crouch = false;
      a.jump = null;
      a.against = -1;
      if (first) {
        // in from the sea on their own side, landing as the intro lifts
        const d = Math.sqrt(a.hx * a.hx + a.hy * a.hy) || 1;
        const from = FLOE_R * PX + 30;
        a.enter = { at: goAt - (KICKOFF_MS - INTRO_MS) - 380, x0: (a.hx / d) * from, y0: (a.hy / d) * from, ms: 420, high: 34, iced: false, begun: false };
        a.shown = false;
      } else if (a.fall) {
        a.enter = { at: now + 60 * k, x0: a.fall.x1, y0: a.fall.y1, ms: BACK_MS, high: 26, iced: a.fall.up, begun: false };
        a.sulkUntil = now + 780;
        a.chill = 1;
      } else {
        a.enter = { at: now, x0: a.x, y0: a.y, ms: 300, high: 9, iced: false, begun: false };
      }
      a.fall = null;
    });
    const stomp = (k: number, at: number) => {
      this.cues.at(at, () => {
        this.actors[k].stompAt = at;
      });
      this.cues.at(at + STOMP_MS, () => {
        const a = this.actors[k];
        this.press(a, 0, 1, -0.24);
        this.fx.dust(a.hx, a.hy + DROP, 8, 0.07);
        this.jolt.shake(0.9, 140, at + STOMP_MS);
        sumoSfx("stomp", { pitch: [1, 0.84, 1.14][k % 3] });
      });
    };
    const called = first ? goAt - (KICKOFF_MS - INTRO_MS) : now;
    this.cues.at(called, () => {
      this.signs.banner(n, point);
      sumoSfx("gong", point ? { pitch: 1.19 } : undefined);
    });
    if (point) this.cues.at(called + 380, () => sumoSfx("point"));
    if (first) for (let k = 0; k < count; k++) stomp(k, goAt - 1230 + k * (count > 2 ? 230 : 320));
    else for (let k = 0; k < count; k++) stomp(k, goAt - 560);
    this.cues.at(goAt - (first ? 400 : 260), () => {
      for (const a of this.actors) a.crouch = true;
      sumoSfx("set");
    });
    this.cues.at(goAt, () => {
      this.live = true;
      for (const a of this.actors) {
        a.crouch = false;
        a.enter = null;
        this.press(a, 0, 1, 0.16);
      }
      this.signs.go();
      sumoSfx("go");
    });
  }

  /** Seat `k` dashed. */
  dash(k: number, now: number) {
    this.todo.push(() => this.doDash(k, now));
  }

  private doDash(k: number, now: number) {
    const a = this.actors[k];
    a.dashAt = now;
    const v = Math.sqrt(a.vx * a.vx + a.vy * a.vy) || 1;
    this.fx.dust(a.x - (a.vx / v) * 6, a.y + DROP - 2, 7, 0.08, -a.vx / v, -a.vy / v, 1.3);
    sumoSfx("dash", { pitch: 0.94 + this.rnd() * 0.14, vol: a.me ? 1 : 0.55 });
  }

  /** This viewer asked for a dash that is not back yet. */
  deny(now: number) {
    if (now - this.denyAt < 200) return;
    this.denyAt = now;
    sumoSfx("deny");
  }

  /**
   * Two wrestlers met at (x, y), game units on this screen, closing at `power` units/ms. `seed` is the same on every
   * screen, so the crack it leaves is too.
   */
  hit(x: number, y: number, power: number, now: number, seed: number) {
    this.todo.push(() => this.doHit(x, y, power, now, seed));
  }

  private doHit(x: number, y: number, power: number, now: number, seed: number) {
    const px = (x - C) * PX;
    const py = (y - C) * PX;
    // the two it was between: the nearest two on the ice
    const near = this.actors
      .map((a, k) => ({ k, d: a.fall || a.enter ? Infinity : (a.x - px) * (a.x - px) + (a.y - py) * (a.y - py) }))
      .sort((p, q) => p.d - q.d);
    if (near.length < 2 || near[1].d === Infinity) return;
    const a = this.actors[near[0].k];
    const b = this.actors[near[1].k];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const squash = -clamp(0.05 + power * 0.95, 0.05, 0.4);
    this.press(a, nx, ny, squash);
    this.press(b, nx, ny, squash);
    if (power < FELT) return;
    if (power < HARD) {
      // shoving shoulder to shoulder is many small bumps: those sound seldom, a real knock at once
      if (now - this.bumpAt < (power < SHOVE ? SHOVE_MS : BUMP_MS)) return;
      this.bumpAt = now;
      this.fx.dust(px, py + DROP, 3 + Math.round(power * 30), 0.05 + power * 0.3);
      if (power > 0.12) this.fx.stars(px, py - MID, 3, 0.07);
      sumoSfx("bump", { pitch: 0.92 + power * 1.4 + this.rnd() * 0.1, vol: 0.4 + power * 3 });
      return;
    }
    // a hard one: the picture holds, the ice cracks, whoever took it sees stars
    const big = clamp((power - HARD) / 0.3, 0, 1);
    this.actors.forEach((o, k) => {
      this.held[k * 2] = o.x;
      this.held[k * 2 + 1] = o.y;
    });
    this.holdUntil = now + 55 + big * 65;
    this.fx.shock(px, py - MID, 22 + big * 16, now);
    this.fx.stars(px, py - MID, 5 + Math.round(big * 4), 0.1 + big * 0.06);
    this.fx.dust(px, py + DROP, 10, 0.12);
    this.floe.crack(px, py + DROP - 1, power, seed, now);
    this.jolt.shake(1.6 + big * 2.6, 200 + big * 120, now);
    const sa = a.vx * a.vx + a.vy * a.vy;
    const sb = b.vx * b.vx + b.vy * b.vy;
    // the one sent flying took it; head on, both did
    for (const [o, mine, theirs] of [
      [a, sa, sb],
      [b, sb, sa],
    ] as const) {
      if (!calm()) o.flashUntil = now + 70;
      if (mine > theirs * 0.6) o.dizzyUntil = now + 650 + big * 500;
    }
    sumoSfx("thud", { pitch: 1.16 - big * 0.3, vol: 0.62 + big * 0.38 });
    this.cues.at(now + 45, () => sumoSfx("crack", { pitch: 0.9 + this.rnd() * 0.3 }));
  }

  /** Seat `k` went over the edge; `last` when that ends the match. */
  fall(k: number, now: number, last: boolean) {
    this.todo.push(() => this.doFall(k, now, last));
  }

  private doFall(k: number, now: number, last: boolean) {
    const a = this.actors[k];
    if (a.fall) return;
    a.enter = null;
    a.jump = null;
    const d = Math.sqrt(a.x * a.x + a.y * a.y) || 1;
    const rx = a.x / d;
    const ry = a.y / d;
    const v = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    // the way they were going, bent outwards so that they land in the water
    let ux = v > 0.02 ? (a.vx / v) * 0.55 + rx * 0.45 : rx;
    let uy = v > 0.02 ? (a.vy / v) * 0.55 + ry * 0.45 : ry;
    const u = Math.sqrt(ux * ux + uy * uy) || 1;
    ux /= u;
    uy /= u;
    const far = clamp(15 + v * 26, 16, 28);
    let x1 = a.x + ux * far;
    let y1 = a.y + uy * far;
    const out = Math.sqrt(x1 * x1 + y1 * y1) || 1;
    const least = d + R + 2;
    if (out < least) {
      x1 *= least / out;
      y1 *= least / out;
    }
    // all of the block of ice they come up in stays in the picture
    x1 = clamp(x1, -this.stage.w / 2 + R + 8, this.stage.w / 2 - R - 8);
    y1 = clamp(y1, -this.stage.h / 2 + 2 * R + 6, this.stage.h / 2 - R - 2);
    a.fall = { at: now, x0: a.x, y0: a.y, x1, y1, air: last ? AIR_LAST_MS : AIR_MS, big: last, wet: false, up: false };
    a.lx = ux;
    a.ly = uy;
    sumoSfx("whee", { pitch: last ? 0.78 : 0.95 + this.rnd() * 0.15, vol: a.me || last ? 1 : 0.7 });
    if (last) this.zoom = { at: now, x: x1, y: y1 };
  }

  /** The game took a fall back: they are on the ice after all. */
  unfall(k: number) {
    this.todo.push(() => this.undoFall(k));
  }

  private undoFall(k: number) {
    this.actors[k].fall = null;
    if (this.zoom && !this.over) this.zoom = null;
  }

  /** The round is decided: `winner` a seat, or -1 with everybody in the water. */
  roundEnd(now: number, winner: number) {
    this.live = false;
    const a = winner >= 0 ? this.actors[winner] : null;
    if (a) {
      a.joyUntil = Infinity;
      a.dizzyUntil = 0;
      a.jump = { at: now + 330, ms: 300, high: 8, landed: false };
    }
    this.cues.at(now + 560, () => sumoSfx(winner < 0 ? "roundDraw" : winner === this.me ? "roundWon" : "roundLost"));
  }

  /** The match is over and `winner` took it: the last ring-out's own moment, then a calm loop under the result card. */
  finale(now: number, winner: number) {
    this.live = false;
    this.over = { at: now, who: winner };
    const a = this.actors[winner];
    if (!a) return;
    a.joyUntil = Infinity;
    a.dizzyUntil = 0;
    const up = now + AIR_LAST_MS + 110;
    this.cues.at(up, () => {
      a.jump = { at: up, ms: 440, high: 20, landed: false };
      sumoSfx(winner === this.me ? "victory" : "defeat");
    });
    this.cues.at(up + 440, () => {
      this.fx.shock(a.x, a.y + DROP - 1, 30, up + 440);
      this.fx.stars(a.x, a.y - MID, 8, 0.14);
      for (const side of [-1, 0, 1]) this.fx.confetti(a.x + side * 34, a.y - MID - 4, 26, [a.color, ...CONFETTI]);
      this.jolt.shake(2.2, 260, up + 440);
      sumoSfx("stomp", { pitch: 0.8 });
    });
  }

  /** How much closer the picture is looked at just now: over 1 only round the last ring-out. */
  private zoomAt(now: number): number {
    if (!this.zoom || calm()) return 1;
    const t = now - this.zoom.at;
    if (t < 0 || t > 1050) return 1;
    const k = t < 170 ? easeOut(t / 170) : t < 600 ? 1 : 1 - ease((t - 600) / 450);
    return 1 + ZOOM * k;
  }

  /** One wrestler's place, mood and motion for this frame. */
  private act(a: Actor, k: number, b: Body, now: number, dt: number, r: number): Pose | null {
    const sx = (b.x - C) * PX;
    const sy = (b.y - C) * PX;
    const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    let mood: Mood = "calm";
    let hands: Hands = "rest";
    const ground = true;
    let lift = 0;
    let lean = 0;
    let stretch: [number, number, number] | null = null;
    a.z = 0;

    if (a.enter) {
      const e = a.enter;
      const u = (now - e.at) / e.ms;
      if (u < 0) {
        if (!a.shown) return null;
        a.x = e.x0;
        a.y = e.y0;
        if (e.iced) return this.pose(a, now, "cold", "none", false, 0, null);
      } else {
        if (!e.begun) {
          e.begun = true;
          a.shown = true;
          if (e.iced) {
            this.fx.shards(e.x0, e.y0 - MID + 4, 14);
            this.fx.ripple(e.x0, e.y0 + DROP + 2, 6, 24, 700, now);
            sumoSfx("shatter", { vol: a.me ? 1 : 0.7 });
          } else if (e.high > 20) {
            this.fx.ripple(e.x0, e.y0, 6, 22, 700, now);
          }
        }
        if (u < 1) {
          const m = ease(u);
          a.x = lerp(e.x0, a.hx, m);
          a.y = lerp(e.y0, a.hy, m);
          a.z = Math.sin(u * Math.PI) * e.high;
          stretch = [0, 1, 0.1 * Math.sin(u * Math.PI)];
          mood = now < a.sulkUntil ? "sulk" : "focus";
          hands = e.high > 20 ? "up" : "rest";
        } else {
          a.enter = null;
          a.x = a.hx;
          a.y = a.hy;
          this.press(a, 0, 1, e.high > 20 ? -0.28 : -0.14);
          this.fx.dust(a.x, a.y + DROP, e.high > 20 ? 9 : 4, 0.07);
          if (e.high > 20) {
            sumoSfx("land", { vol: a.me ? 1 : 0.7 });
            this.jolt.shake(0.8, 120, now);
          }
        }
      }
    } else if (a.fall) {
      const f = a.fall;
      const t = now - f.at;
      if (t < f.air) {
        const u = t / f.air;
        a.x = lerp(f.x0, f.x1, u);
        a.y = lerp(f.y0, f.y1, u);
        a.z = Math.sin(u * Math.PI) * (f.big ? 22 : 13);
        return this.pose(a, now, "fall", "flail", false, 0, [0, 1, 0.08]);
      }
      a.x = f.x1;
      a.y = f.y1;
      if (!f.wet) {
        f.wet = true;
        this.fx.splash(f.x1, f.y1 + DROP, f.big, now);
        sumoSfx("splash", { pitch: f.big ? 0.84 : 0.96 + this.rnd() * 0.12, vol: f.big ? 1 : a.me ? 0.92 : 0.74 });
        this.jolt.shake(f.big ? 4.5 : a.me ? 3 : 1.6, f.big ? 420 : 300, now);
        if (f.big || a.me) this.jolt.flash("#bfe9ff", f.big ? 0.22 : 0.14, 260, now);
        this.signs.splash(f.x1 / this.stage.w + 0.5, f.y1 / this.stage.h + 0.5, f.big);
        this.cues.at(now + 170, () => {
          this.fx.bubbles(f.x1, f.y1 + DROP, 5);
          sumoSfx("bubbles", { vol: 0.8 });
        });
      }
      const under = UNDER_MS + (f.big ? 160 : 0);
      const tu = t - f.air - under;
      if (tu < 0) return null;
      if (!f.up) {
        f.up = true;
        this.fx.ripple(f.x1, f.y1 + DROP + 2, 8, 30, 800, now);
        this.fx.ripple(f.x1, f.y1 + DROP + 2, 5, 20, 700, now, 180);
        sumoSfx("surface", { vol: a.me ? 1 : 0.7 });
      }
      return this.pose(a, now, "cold", "none", false, 0, null);
    } else {
      let x = sx;
      let y = sy;
      if (now < this.holdUntil) {
        x = this.held[k * 2] + (calm() ? 0 : Math.floor(now / 28) % 2 ? 0.6 : -0.6);
        y = this.held[k * 2 + 1];
      } else if (now < this.holdUntil + 90) {
        const m = easeOut((now - this.holdUntil) / 90);
        x = lerp(this.held[k * 2], sx, m);
        y = lerp(this.held[k * 2 + 1], sy, m);
      }
      a.x = x;
      a.y = y;
    }
    a.shown = true;

    if (a.jump) {
      const u = (now - a.jump.at) / a.jump.ms;
      if (u >= 0 && u < 1) {
        a.z = Math.sin(u * Math.PI) * a.jump.high;
        stretch = [0, 1, 0.12 * Math.sin(u * Math.PI)];
      } else if (u >= 1 && !a.jump.landed) {
        a.jump.landed = true;
        this.press(a, 0, 1, -0.1 - a.jump.high * 0.012);
        this.fx.dust(a.x, a.y + DROP, 5, 0.06);
      }
    }

    const d = Math.sqrt(a.x * a.x + a.y * a.y) || 1;
    const onIce = !a.enter;
    // the edge: how near, and whether they are still going out
    let edge = 0;
    if (this.live && onIce) {
      const room = (r - d) / PX;
      const outward = (a.vx * a.x + a.vy * a.y) / d;
      edge = clamp(1 - (room - 0.5) / 7, 0, 1) * (outward < -0.04 ? 0.45 : 1);
    }
    a.panic += (edge - a.panic) * (1 - Math.pow(0.5, dt / 70));
    // shoulder to shoulder with somebody
    a.against = -1;
    if (this.live && onIce) {
      this.actors.forEach((o, j) => {
        if (o === a || o.fall || o.enter) return;
        const gap = Math.sqrt((o.x - a.x) * (o.x - a.x) + (o.y - a.y) * (o.y - a.y));
        if (gap < TOUCH + 3) a.against = j;
      });
    }
    const pushing = a.against >= 0 ? 1 : 0;
    a.strain += (pushing - a.strain) * (1 - Math.pow(0.5, dt / (pushing ? 45 : 150)));

    if (a.panic > 0.3) {
      const ux = a.x / d;
      const uy = a.y / d;
      if (now > a.crumbAt) {
        a.crumbAt = now + lerp(250, 80, a.panic);
        this.fx.crumbs(ux * r, uy * r, a.panic > 0.7 ? 2 : 1, ux, uy);
        if (now - this.plipAt > 320) {
          this.plipAt = now;
          sumoSfx("plip", { pitch: 0.85 + this.rnd() * 0.5, vol: 0.5 + a.panic * 0.5 });
        }
      }
      if (a.panic > 0.5 && now - this.creakAt > 820) {
        this.creakAt = now;
        sumoSfx("creak", { pitch: 0.85 + a.panic * 0.5 });
        this.fx.ripple(ux * (r + 3), uy * (r + 3), 3, 14, 600, now);
      }
      if (a.panic > 0.45 && now > a.sweatAt) {
        a.sweatAt = now + 190;
        const way = this.rnd() < 0.5 ? -1 : 1;
        this.fx.sweat(a.x + way * 9, a.y - MID - R + 5, way);
      }
      // teetering on the rim
      if (a.panic > 0.6 && speed < 0.3) lean = Math.sin(now * 0.034 + k) * 1.3 * a.panic;
    }
    if (a.strain > 0.5 && now > a.steamAt) {
      a.steamAt = now + 300 + this.rnd() * 160;
      this.fx.steam(a.x, a.y - MID - R - 4);
    }

    const stomping = now - a.stompAt;
    if (now < a.dizzyUntil) {
      mood = "dizzy";
    } else if (now < a.joyUntil) {
      mood = "joy";
      hands = "up";
    } else if (mood === "calm" && now < a.sulkUntil) {
      mood = "sulk";
    } else if (a.panic > 0.45) {
      mood = "panic";
      if (a.panic > 0.6) hands = "flail";
    } else if (a.strain > 0.5) {
      mood = "strain";
      hands = "push";
    } else if (a.crouch) {
      mood = "focus";
      hands = "fists";
      stretch = [0, 1, -0.13];
    } else if (stomping >= 0 && stomping < STOMP_MS) {
      mood = "focus";
      hands = "knees";
      lift = k % 2 ? 1 : -1;
      lean = -lift * 2;
      stretch = [0, 1, 0.07];
    } else if (onIce && (speed > 0.32 || now - a.dashAt < 240)) {
      mood = "focus";
      hands = "back";
    }

    // where they look: the way they go, the one they push, the water they are about to meet, or the nearest other
    let tx = 0;
    let ty = 0.5;
    if (mood === "joy") {
      ty = 0.55;
    } else if (mood === "panic") {
      tx = a.x / d;
      ty = a.y / d;
    } else if (a.against >= 0) {
      const o = this.actors[a.against];
      const gap = Math.sqrt((o.x - a.x) * (o.x - a.x) + (o.y - a.y) * (o.y - a.y)) || 1;
      tx = (o.x - a.x) / gap;
      ty = (o.y - a.y) / gap;
    } else if (speed > 0.07 && onIce && this.live) {
      tx = a.vx / speed;
      ty = a.vy / speed;
    } else {
      let best = Infinity;
      for (const o of this.actors) {
        if (o === a || o.fall) continue;
        const gap = Math.sqrt((o.hx - a.x) * (o.hx - a.x) + (o.hy - a.y) * (o.hy - a.y));
        const ox = this.live ? o.x : o.hx;
        const oy = this.live ? o.y : o.hy;
        const far = Math.sqrt((ox - a.x) * (ox - a.x) + (oy - a.y) * (oy - a.y)) || 1;
        if (gap < best) {
          best = gap;
          tx = (ox - a.x) / far;
          ty = (oy - a.y) / far;
        }
      }
    }
    const turn = 1 - Math.pow(0.5, dt / 60);
    a.lx += (tx - a.lx) * turn;
    a.ly += (ty - a.ly) * turn;

    if (speed > 0.04 && onIce && a.z === 0) a.walk = (Math.max(0, a.walk) + (speed * dt) / 13) % 1;
    else a.walk = -1;
    if (a.chill > 0 && !a.enter) a.chill = Math.max(0, a.chill - dt / 2400);

    // a dash stretches them along the way they go
    if (!stretch && onIce && speed > 0.27) {
      const by = clamp((speed - 0.27) / 0.33, 0, 1) * 0.2;
      stretch = [a.vx / speed, a.vy / speed, by];
    }
    // shoulder to shoulder, each gives a little
    if (!stretch && a.against >= 0 && a.strain > 0.2) {
      const o = this.actors[a.against];
      const gap = Math.sqrt((o.x - a.x) * (o.x - a.x) + (o.y - a.y) * (o.y - a.y)) || 1;
      stretch = [(o.x - a.x) / gap, (o.y - a.y) / gap, -0.09 * a.strain - 0.02 * Math.sin(now / 60 + k)];
    }
    if (!stretch && speed < 0.04) stretch = [0, 1, Math.sin(now / 520 + k * 2) * 0.028];
    return this.pose(a, now, mood, hands, ground, lift, stretch, lean);
  }

  private pose(
    a: Actor,
    now: number,
    mood: Mood,
    hands: Hands,
    ground: boolean,
    lift: number,
    stretch: [number, number, number] | null,
    lean = 0,
  ): Pose {
    let ax = a.ax;
    let ay = a.ay;
    let k = a.s;
    if (stretch && Math.abs(stretch[2]) > Math.abs(k)) [ax, ay, k] = stretch;
    if (now > a.blinkAt + 120) a.blinkAt = now + 1700 + this.rnd() * 2600;
    return {
      x: a.x + lean,
      y: a.y,
      z: a.z,
      color: a.color,
      ax,
      ay,
      k,
      lx: a.lx,
      ly: a.ly,
      mood,
      blink: now > a.blinkAt,
      t: now,
      walk: a.walk,
      hands,
      lift,
      flash: now < a.flashUntil,
      chill: a.chill,
      ground,
    };
  }

  /**
   * One frame. `r` is the floe's radius in game units, `aim` where this viewer points (game units on the screen) or
   * null, `live` whether a round is on and undecided, `melt` how far the floe has melted, 0 to 1.
   */
  frame(ctx: Ctx, now: number, r: number, bodies: readonly Body[], aim: { x: number; y: number } | null, live: boolean, melt: number) {
    const st = this.stage;
    if (st.takeResize()) {
      this.sea.resize(st.w, st.h);
      this.back = null;
    }
    const dt = this.prev ? Math.min(100, now - this.prev) : 16;
    this.prev = now;
    this.cues.run(now);
    this.jolt.update(now);
    if (!live) this.live = false;
    else if (now >= this.goAt) this.live = true;
    let rp = r * PX;
    if (this.grow) {
      // a new round's ice is whole again: seen, it freezes back out from what was left
      const u = (now - this.grow.at) / GROW_MS;
      if (u >= 1 || this.grow.from > rp - 2) this.grow = null;
      else rp = lerp(this.grow.from, rp, easeOut(u));
    }
    this.shownR = rp;
    this.actors.forEach((a, k) => {
      a.vx = bodies[k].vx * PX;
      a.vy = bodies[k].vy * PX;
    });
    for (const run of this.todo.splice(0)) run();

    // every body's spring, a few ms at a time so a slow frame cannot blow it up
    for (const a of this.actors) {
      for (let left = dt; left > 0; left -= 8) {
        const h = Math.min(8, left);
        a.sv += (-0.0011 * a.s - 0.02 * a.sv) * h;
        a.s = clamp(a.s + a.sv * h, -0.42, 0.34);
      }
    }
    const poses: (Pose | null)[] = this.actors.map((a, k) => this.act(a, k, bodies[k], now, dt, rp));

    // the floe melting: pieces of the rim break off, quicker as it goes
    if (melt > 0 && this.live) {
      if (!this.melting) {
        this.melting = true;
        this.chunkR = r;
        this.signs.melt();
        sumoSfx("melt");
      }
      if (r < this.chunkR - lerp(2.4, 1.1, melt)) {
        this.chunkR = r;
        const at = hash(Math.round(r * 8) + this.roundNo * 977) * Math.PI * 2;
        const ux = Math.cos(at);
        const uy = Math.sin(at);
        this.fx.chunk(ux * (rp + 3), uy * (rp + 3), ux, uy);
        this.fx.crumbs(ux * rp, uy * rp, 3, ux, uy);
        sumoSfx("chunk", { pitch: 1 + melt * 0.5 + this.rnd() * 0.1, vol: 0.7 + melt * 0.3 });
      }
    }
    this.fx.step(dt, rp, now);

    // the sky over it: rose as the ice goes or the match hangs on one round, brighter for the winner
    const hot = Math.max(this.point && !this.over ? 0.3 : 0, this.over ? 0 : melt);
    this.heat += (hot - this.heat) * (1 - Math.pow(0.5, dt / 500));
    this.cheer += ((this.over ? 1 : 0) - this.cheer) * (1 - Math.pow(0.5, dt / 500));
    this.sea.update(now, rp, clamp(this.heat, 0, 1), this.cheer);

    // the winner's calm loop: a hop now and then, confetti still coming down
    if (this.over && now - this.over.at > 1900) {
      const a = this.actors[this.over.who];
      if (a && (!a.jump || a.jump.landed) && now - (a.jump?.at ?? 0) > 1250) a.jump = { at: now, ms: 340, high: 7, landed: false };
      if (now > this.dripAt) {
        this.dripAt = now + 230;
        if (a) this.fx.confetti((this.rnd() - 0.5) * st.w * 0.8, -st.h * 0.2 + this.rnd() * st.h * 0.5, 1, [a.color, ...CONFETTI]);
      }
    }

    const z = this.zoomAt(now);
    let to = ctx;
    if (z > 1) {
      if (!this.back || this.back.width !== st.canvas.width || this.back.height !== st.canvas.height) {
        this.back = document.createElement("canvas");
        this.back.width = st.canvas.width;
        this.back.height = st.canvas.height;
      }
      to = this.back.getContext("2d")!;
    }
    to.setTransform(1, 0, 0, 1, 0, 0);
    to.fillStyle = INK;
    to.fillRect(0, 0, st.canvas.width, st.canvas.height);
    st.begin(to, this.jolt.dx, this.jolt.dy);
    const sw = this.sea.canvas.width * SEA;
    const sh = this.sea.canvas.height * SEA;
    to.drawImage(this.sea.canvas, -sw / 2, -sh / 2, sw, sh);
    this.fx.drawUnder(to, st, now, rp);
    // whoever came up beyond the far rim is behind the floe
    const frozen = (k: number) => {
      const p = poses[k];
      const f = this.actors[k].fall;
      if (!p) return;
      let rise = 1;
      if (f) {
        const tu = now - f.at - f.air - UNDER_MS - (f.big ? 160 : 0);
        rise = tu < RISE_MS ? easeOut(tu / RISE_MS) * 1.14 : 1 + 0.14 * Math.max(0, 1 - (tu - RISE_MS) / 150);
      }
      drawFrozen(to, st, p, rise, now);
    };
    const iced = (k: number) => poses[k]?.mood === "cold" && poses[k]?.hands === "none";
    const behind = (k: number) => iced(k) && this.actors[k].y < 0;
    this.actors.forEach((_, k) => {
      if (behind(k)) frozen(k);
    });
    const marks = this.actors.map((a) => ({ x: a.hx, y: a.hy }));
    this.floe.draw(to, now, rp, marks);
    this.actors.forEach((a, k) => {
      if (a.panic > 0.3 && !a.fall) this.floe.strain(to, rp, Math.atan2(a.y, a.x), a.panic * 13, k * 100 + this.roundNo * 7);
    });

    // this viewer's own: the ring that says the dash is back, and where they point
    const mine = this.actors[this.me];
    const body = bodies[this.me];
    if (mine && body && poses[this.me] && !mine.fall && !mine.enter && !this.over) this.ring(to, mine, body.ready, now);
    if (aim && this.live) {
      const x = Math.round((aim.x - C) * PX);
      const y = Math.round((aim.y - C) * PX);
      to.globalAlpha = 0.75;
      for (const [i, j] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        dot(to, x + i * 4 - (i > 0 ? 1 : 0), y + j * 4, mine.color, 2, 1);
        dot(to, x + i * 4, y + j * 4 - (j > 0 ? 1 : 0), mine.color, 1, 2);
      }
      to.globalAlpha = 1;
    }

    // from the far side of the floe to the near one
    const order = this.actors.map((_, k) => k).sort((p, q) => this.actors[p].y - this.actors[q].y);
    for (const k of order) {
      const p = poses[k];
      const a = this.actors[k];
      if (!p) continue;
      if (iced(k)) {
        if (!behind(k)) frozen(k);
        continue;
      }
      drawWrestler(to, st, p);
      if (p.mood === "dizzy") {
        for (let i = 0; i < 3; i++) {
          const at = now / 170 + (i * Math.PI * 2) / 3;
          stamp(to, DIZZY, st.hang(a.x + Math.cos(at) * 12) - 1, st.hang(a.y - MID - R - 6 + Math.sin(at) * 3) - 1, { K: i === 1 ? "#ffffff" : "#ffd25a" });
        }
      }
      if (a.me && now < this.goAt && !a.enter) {
        const bob = Math.floor(now / 260) % 2;
        stamp(to, POINTER, st.hang(a.x) - 2, st.hang(a.y) - MID - R - 12 + bob, { K: INK });
        stamp(to, POINTER, st.hang(a.x) - 2, st.hang(a.y) - MID - R - 13 + bob, { K: a.color });
      }
    }
    this.fx.drawOver(to, st, now);
    this.fx.drawSnow(to, st, now, st.w, st.h);
    this.jolt.overlay(to, -st.w / 2 - 6, -st.h / 2 - 6, st.w + 12, st.h + 12, now);

    if (to !== ctx && this.zoom && this.back) {
      const w = st.canvas.width;
      const h = st.canvas.height;
      const sw = w / z;
      const sh = h / z;
      const fx = (st.w / 2 + this.zoom.x * 0.6) * st.k;
      const fy = (st.h / 2 + this.zoom.y * 0.6) * st.k;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.back, clamp(fx - sw / 2, 0, w - sw), clamp(fy - sh / 2, 0, h - sh), sw, sh, 0, 0, w, h);
    }
  }

  /** The ring on the ice round this viewer's feet: whole and bright when the dash is back, an arc while it is not. */
  private ring(ctx: Ctx, a: Actor, ready: number, now: number) {
    const denied = now - this.denyAt < 140;
    const full = ready >= 1;
    ctx.fillStyle = denied ? "#ff7a7a" : full ? (Math.floor(now / 420) % 2 ? a.color : "#fff1c2") : "#b88d2a";
    const rx = R + 4;
    const ry = 8;
    const n = Math.ceil(rx * 6.4);
    const upto = full ? n : Math.round(n * clamp(ready, 0, 1));
    const x = this.stage.hang(a.x);
    const y = this.stage.hang(a.y) + DROP - 4;
    let lastX = NaN;
    let lastY = NaN;
    for (let i = 0; i < upto; i++) {
      const at = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const px = Math.round(Math.cos(at) * rx);
      const py = Math.round(Math.sin(at) * ry);
      if (px === lastX && py === lastY) continue;
      lastX = px;
      lastY = py;
      ctx.fillRect(x + px, y + py, 1, 1);
    }
  }

  /** Nothing more is staged: the game stopped. */
  stop() {
    this.cues.clear();
  }

  dispose() {
    this.stage.dispose();
  }
}
