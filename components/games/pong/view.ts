"use client";

import { GAP, H, PAD_H, PAD_W, R, W } from "@/lib/live/pong";
import * as snd from "@/lib/live/sounds/pong";
import { INTRO_MS, KICKOFF_MS } from "../beats";
import { Ctx, INK, MINE, THEIRS, digits, digitsW, glow, ring } from "../fx";
import { Bits } from "./bits";
import { BALL, CHALK, DROP, FACE_L, FACE_R, MINT, PINK, along, heatOf, hot, lift, paintDusk, paintTable } from "./look";
import { Cam, Stage } from "./stage";

export interface Moving {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** The game at one frame, the way this viewer sees it: their own paddle on the left, the other player's on the right. */
export interface Scene {
  /** the ball in flight, or null between points */
  ball: Moving | null;
  /** it got past a paddle and is on its way out */
  dead: boolean;
  /** hits in this rally so far, and whether the last was off a paddle's tip */
  rally: number;
  tip: boolean;
  /** the paddles' heights */
  mine: number;
  theirs: number;
  /** ms till the next serve, or -1 when none is coming */
  serveIn: number;
  /** who serves it, 0 the viewer and 1 the other player, and the way it will fly */
  server: 0 | 1;
  aim: { vx: number; vy: number } | null;
  /** who is a point from winning: 1 the viewer, 2 the other player, 3 both, 0 nobody */
  match: number;
  /** the match's first serve, which is counted in aloud: the beats before it are not this table's to make */
  first: boolean;
}

const CONFETTI = [MINE, THEIRS, PINK, "#7ef0c2", "#ffffff", "#c9a6ff"];
const SIDE_COLOR = [MINE, THEIRS] as const;

/** a paddle stays lit this long after it hits, and springs for this long */
const LIT_MS = 170;
const SPRING_MS = 420;
/** the ball is held on the paddle's tip for a moment after a sharp hit, then catches up: drawn only */
const TIP_HOLD_MS = 46;
const CATCH_MS = 80;
/** a hit runs along the rails this fast, units/ms, for this long */
const RUN_SPEED = 0.5;
const RUN_MS = 330;
const KNOCK_MS = 260;
/** a lost ball is held against the wall this long before the table answers; the last ball of a match longer */
const FREEZE_MS = 110;
const FREEZE_FINAL_MS = 240;
/** the table's answer first, then the scorer's digit turns over */
const FLIP_AFTER_MS = 170;
const FLIP_OUT_MS = 90;
const FLIP_IN_MS = 190;
const WALL_MS = 760;
/** the ball is put on the server's paddle this long before a serve */
const SHOW_MS = 1000;
/** the rally's count is shown from this many hits on */
const COUNT_FROM = 3;
const NET_DASHES = 16;

/** the viewer asked for less motion: nothing shakes, flashes or freezes, and the table's own stir is left out */
const quiet = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const calm = () => !!quiet?.matches;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const outCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
/** past the end and back: something that lands with a little too much go */
const outBack = (t: number) => {
  const f = clamp01(t) - 1;
  return 1 + f * f * (2.7 * f + 1.7);
};

interface Ring {
  x: number;
  y: number;
  t: number;
  ms: number;
  r0: number;
  r1: number;
  color: string;
  a: number;
}

/** The last places the ball was and how hot it was there, for the streak behind it; by time, not by frame. */
class Streak {
  private static readonly N = 72;
  private readonly xs = new Float32Array(Streak.N);
  private readonly ys = new Float32Array(Streak.N);
  private readonly hs = new Float32Array(Streak.N);
  private readonly ts = new Float64Array(Streak.N);
  private at = 0;
  private len = 0;

  push(x: number, y: number, heat: number, now: number) {
    this.xs[this.at] = x;
    this.ys[this.at] = y;
    this.hs[this.at] = heat;
    this.ts[this.at] = now;
    this.at = (this.at + 1) % Streak.N;
    this.len = Math.min(Streak.N, this.len + 1);
  }

  clear() {
    this.len = 0;
  }

  /** Everything younger than `span` ms, oldest faintest and smallest, added to what is under it. */
  draw(ctx: Ctx, snap: (v: number) => number, now: number, span: number, size: number, a: number) {
    if (this.len < 2) return;
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.len; i++) {
      const j = (this.at - this.len + i + Streak.N) % Streak.N;
      const f = 1 - (now - this.ts[j]) / span;
      if (f <= 0) continue;
      const z = size * (0.3 + 0.7 * f);
      ctx.globalAlpha = a * f * f;
      ctx.fillStyle = hot(this.hs[j] * (0.45 + 0.55 * f));
      ctx.fillRect(snap(this.xs[j] - z / 2), snap(this.ys[j] - z / 2), z, z);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = op;
  }
}

/** A point being shown: the ball against the wall, the table's answer, the digit turning over. */
interface Beat {
  t0: number;
  mine: boolean;
  final: boolean;
  y: number;
  /** 0 the ball is still on its way to the wall, 1 held there, 2 the table has answered, 3 the digit has turned */
  stage: 0 | 1 | 2 | 3;
  at: number;
}

/**
 * What the table looks and sounds like, apart from the game's rules. It is handed the game frame by frame and reads
 * everything off it (a hit is the rally's count going up, a serve is a ball where there was none), so the other
 * player's hits show the same as one's own and nothing here ever reaches back into the game.
 */
export class PongView {
  readonly stage: Stage;
  /** told the score each time a big digit turns over, so the scoreboard's lamps light on the same beat */
  onTally: ((mine: number, theirs: number) => void) | null = null;
  private base!: HTMLCanvasElement;
  private dusk!: HTMLCanvasElement;
  private readonly bits = new Bits();
  private readonly streak = new Streak();
  private rings: Ring[] = [];
  private knocks: { x: number; top: boolean; t: number }[] = [];
  private readonly cam: Cam = { dx: 0, dy: 0, zoom: 1, x: W / 2, y: H / 2 };
  private t0 = 0;
  private prev = 0;

  /** the ball last frame */
  private had = false;
  private live = false;
  private pvy = 0;
  private pu = 0;
  private pright = true;
  private last = { x: W / 2, y: H / 2 };
  private seenRally = 0;
  private heat = 0;
  private hold = { until: -1e9, x: 0, y: 0 };

  /** each paddle's last hit, for its spring and its light */
  private readonly hits = [
    { t: -1e9, y: H / 2, power: 0, tip: false },
    { t: -1e9, y: H / 2, power: 0, tip: false },
  ];
  private readonly padWas = [H / 2, H / 2];
  private readonly padGhost = [H / 2, H / 2];
  private run = { t: -1e9, way: 1, color: MINE as string, power: 0 };
  private countPop = -1e9;
  private countA = 0;
  private count = 0;
  private meter = 0;
  private emberDue = 0;

  /** the big digits: what each shows, what it is turning to, and when it began to turn */
  private readonly tally = [
    { shown: 0, next: 0, flipAt: -1e9 },
    { shown: 0, next: 0, flipAt: -1e9 },
  ];
  private readonly want = [0, 0];
  private beat: Beat | null = null;
  private wall: { side: number; t: number; y: number; color: string } | null = null;
  private shakeEnd = 0;
  private shakeMs = 1;
  private shakeMag = 0;
  private flashEnd = 0;
  private flashMs = 1;
  private flashA = 0;
  private flashColor = "#ffffff";
  private punch = { t: -1e9, ms: 1, mag: 0 };

  private pServeIn = Infinity;
  private heldAt = 0;
  private mp = 0;
  private mpColor: string = PINK;
  private heart = -1e9;
  private end: { mine: boolean; at: number } | null = null;
  private emberAt = 0;
  private readonly motes: { x: number; y: number; vx: number; vy: number; ph: number }[] = [];
  /** numbers painted once at this scale, so that one grown or turned over is still made of whole blocks */
  private readonly glyphs = new Map<string, HTMLCanvasElement>();

  constructor(canvas: HTMLCanvasElement, tall: boolean) {
    this.stage = new Stage(canvas, tall);
    this.paint();
    for (let i = 0; i < 16; i++) {
      this.motes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.004,
        vy: (Math.random() - 0.5) * 0.004,
        ph: Math.random() * 7,
      });
    }
  }

  private paint() {
    this.base = this.stage.layer((ctx) => paintTable(ctx, this.stage.k));
    this.dusk = this.stage.layer(paintDusk);
    this.glyphs.clear();
  }

  /** A number in scoreboard blocks `cell` units each, centred on where the context stands. */
  private number(ctx: Ctx, text: string, cell: number, color: string) {
    const key = `${text} ${cell} ${color}`;
    const w = digitsW(text, cell);
    const h = 5 * cell;
    let g = this.glyphs.get(key);
    if (!g) {
      const k = this.stage.k;
      g = document.createElement("canvas");
      g.width = Math.round(w * k);
      g.height = Math.round(h * k);
      const c = g.getContext("2d")!;
      c.setTransform(k, 0, 0, k, 0, 0);
      digits(c, text, 0, 0, cell, color);
      if (this.glyphs.size > 240) this.glyphs.clear();
      this.glyphs.set(key, g);
    }
    ctx.drawImage(g, -w / 2, -h / 2, w, h);
  }

  /** Lays the table down or stands it on end. */
  turn(tall: boolean) {
    if (this.stage.turn(tall)) this.paint();
  }

  /** The score both screens are sure of; a digit turns over when the point is shown, or at once with none to show. */
  score(mine: number, theirs: number) {
    this.want[0] = mine;
    this.want[1] = theirs;
  }

  /** A point was scored: the ball is followed to the wall and the table answers. `final` is the match's last. */
  point(mine: boolean, final: boolean, now: number) {
    this.beat = { t0: now, mine, final, y: this.last.y, stage: 0, at: 0 };
  }

  private shake(mag: number, ms: number, now: number) {
    if (calm()) return;
    this.shakeMag = mag;
    this.shakeMs = ms;
    this.shakeEnd = now + ms;
  }

  private flash(color: string, a: number, ms: number, now: number) {
    if (calm()) return;
    this.flashColor = color;
    this.flashA = a;
    this.flashMs = ms;
    this.flashEnd = now + ms;
  }

  private turnDigit(i: number, now: number) {
    const d = this.tally[i];
    if (d.next === this.want[i]) return;
    d.shown = d.next;
    d.next = this.want[i];
    d.flipAt = now;
    snd.flip();
    this.onTally?.(this.tally[0].next, this.tally[1].next);
  }

  // ---- what happens on the table, read off the game -------------------------------------------------------

  private watch(sc: Scene, now: number) {
    const b = sc.ball;
    const live = !!b && !sc.dead;
    if (b) {
      this.last.x = b.x;
      this.last.y = b.y;
    } else this.streak.clear();
    if (live && b) {
      const right = b.vx > 0;
      const u = along(b.x, right);
      this.heat = heatOf(b.vx, b.vy);
      if (!this.live && sc.rally === 0) this.onServe(b, now);
      else if (sc.rally > this.seenRally) this.onHit(b, sc, now);
      else if (this.had && this.pvy !== 0 && Math.sign(b.vy) !== Math.sign(this.pvy)) this.onRail(b, now);
      else if (this.had && right === this.pright && this.pu < DROP && u >= DROP) this.onDrop(b, sc.rally, now);
      this.pu = u;
      this.pright = right;
      this.pvy = b.vy;
      this.seenRally = sc.rally;
      this.count = sc.rally;
    } else if (!b) this.seenRally = 0;
    this.had = !!b;
    this.live = live;

    // the beats before a serve: two soft ones, and a heart's before a point that can end the match
    const left = sc.serveIn >= 0 ? sc.serveIn : Infinity;
    if (left < Infinity) {
      if (!sc.first) {
        if (this.pServeIn > 560 && left <= 560) snd.ready(false);
        if (this.pServeIn > 280 && left <= 280) snd.ready(true);
      }
      if (sc.match && this.pServeIn > 1000 && left <= 1000) {
        snd.pulse();
        this.heart = now;
      }
    }
    this.pServeIn = left;
  }

  private onServe(b: Moving, now: number) {
    const color = SIDE_COLOR[b.vx > 0 ? 0 : 1];
    this.rings.push({ x: b.x, y: b.y, t: now, ms: 240, r0: 2, r1: 9, color, a: 0.7 });
    this.bits.burst(b.x, b.y, 6, 0.05, [color, "#ffffff"], { dir: b.vx > 0 ? 0 : Math.PI, spread: 1.4, life: 260 });
    this.streak.clear();
    this.count = 0;
    snd.served();
  }

  private onHit(b: Moving, sc: Scene, now: number) {
    const side = b.vx > 0 ? 0 : 1;
    const color = SIDE_COLOR[side];
    const fx = side ? FACE_R : FACE_L;
    const heat = this.heat;
    const y = b.y;
    const hit = this.hits[side];
    hit.t = now;
    hit.y = y;
    hit.tip = sc.tip;
    hit.power = sc.tip ? 2.7 : 1.3 + heat * 0.9;
    this.run = { t: now, way: side ? -1 : 1, color, power: 0.4 + 0.6 * Math.min(1, sc.rally / 12) };
    this.countPop = now;
    const still = calm();
    if (sc.tip) {
      // off the tip: a harder, whiter answer, and the ball sticks for a blink before it is away
      this.rings.push({ x: fx, y, t: now, ms: 300, r0: 2, r1: 17, color: "#ffffff", a: 0.9 });
      this.rings.push({ x: fx, y, t: now + 50, ms: 320, r0: 2, r1: 12, color: PINK, a: 0.7 });
      this.bits.burst(fx, y, 18, 0.16, ["#ffffff", PINK, color], { dir: Math.atan2(b.vy, b.vx), spread: 0.9, life: 340 });
      if (!still) {
        this.hold = { until: now + TIP_HOLD_MS, x: fx + (side ? -R : R), y };
        this.shake(0.9, 130, now);
      }
      snd.crack();
    } else {
      this.rings.push({ x: fx, y, t: now, ms: 220, r0: 2, r1: 8 + heat * 5, color, a: 0.75 });
      if (sc.rally >= 12) this.shake(0.45, 90, now);
    }
    this.bits.burst(fx, y, 5 + Math.round(heat * 9), 0.04 + heat * 0.08, [color, "#ffffff"], {
      dir: side ? Math.PI : 0,
      spread: 2,
      life: 300,
    });
    snd.ping(sc.rally, heat);
  }

  private onRail(b: Moving, now: number) {
    const top = b.y < H / 2;
    this.knocks.push({ x: b.x, top, t: now });
    this.bits.burst(b.x, top ? 1 : H - 1, 3 + Math.round(this.heat * 4), 0.04 + this.heat * 0.04, [CHALK, "#ffffff"], {
      dir: top ? Math.PI / 2 : -Math.PI / 2,
      spread: 2.2,
      life: 220,
    });
    snd.rail(this.heat);
  }

  private onDrop(b: Moving, rally: number, now: number) {
    this.rings.push({ x: b.x, y: b.y, t: now, ms: 200, r0: 1, r1: 5 + this.heat * 2, color: CHALK, a: 0.5 });
    snd.tock(rally, this.heat);
  }

  // ---- a point shown ---------------------------------------------------------------------------------------

  private runBeat(sc: Scene, now: number) {
    const bt = this.beat;
    if (!bt) {
      // nothing to show (a game picked up half-way): the digits simply follow
      if (this.tally[0].next !== this.want[0]) this.turnDigit(0, now);
      if (this.tally[1].next !== this.want[1]) this.turnDigit(1, now);
      return;
    }
    const still = calm();
    const freeze = still ? 0 : bt.final ? FREEZE_FINAL_MS : FREEZE_MS;
    const b = sc.ball;
    const color = SIDE_COLOR[bt.mine ? 0 : 1];
    const x = bt.mine ? W : 0;
    if (bt.stage === 0 && (!b || !sc.dead || b.x <= 1 || b.x >= W - 1 || now - bt.t0 > 240)) {
      bt.stage = 1;
      bt.at = now;
      if (b && sc.dead) bt.y = b.y;
      bt.y = Math.max(3, Math.min(H - 3, bt.y));
      this.hold = { until: now + freeze, x: bt.mine ? W - 1.5 : 1.5, y: bt.y };
      snd.thud(bt.final);
    }
    if (bt.stage === 1 && now >= bt.at + freeze) {
      bt.stage = 2;
      const into = bt.mine ? Math.PI : 0;
      this.bits.burst(x, bt.y, bt.final ? 90 : 40, bt.final ? 0.2 : 0.13, [color, "#ffffff"], {
        dir: into,
        spread: 2.5,
        life: bt.final ? 900 : 650,
        size: 1.2,
      });
      this.rings.push({ x, y: bt.y, t: now, ms: 820, r0: 4, r1: 190, color, a: 0.6 });
      this.rings.push({ x, y: bt.y, t: now + 130, ms: 820, r0: 4, r1: 190, color: "#ffffff", a: 0.3 });
      if (bt.final) this.rings.push({ x, y: bt.y, t: now + 280, ms: 900, r0: 4, r1: 190, color, a: 0.45 });
      this.wall = { side: bt.mine ? 1 : 0, t: now, y: bt.y, color };
      this.shake(bt.final ? 3.4 : 2, bt.final ? 520 : 340, now);
      this.flash(color, bt.final ? 0.34 : 0.2, bt.final ? 460 : 280, now);
      if (bt.final && !still) {
        this.punch = { t: now, ms: 620, mag: 0.08 };
        this.cam.x = Math.max(30, Math.min(W - 30, x));
        this.cam.y = bt.y;
      }
      this.streak.clear();
      if (bt.final) snd.final(bt.mine);
      else snd.point(bt.mine);
    }
    if (bt.stage === 2 && now >= bt.at + freeze + FLIP_AFTER_MS) {
      bt.stage = 3;
      this.turnDigit(bt.mine ? 0 : 1, now);
      if (bt.final) this.celebrate(bt.mine, now);
    }
    if (bt.stage === 3 && now > bt.at + 1200) this.beat = null;
  }

  /** The match is won: the winner's half is lit and stays so, with confetti if the winner is the viewer. */
  private celebrate(mine: boolean, now: number) {
    this.end = { mine, at: now };
    if (!mine || calm()) return;
    for (const y of [H * 0.2, H * 0.5, H * 0.8]) {
      this.bits.burst(2, y, 46, 0.2, CONFETTI, { dir: 0, spread: 1.5, life: 2600, size: 1.5, fall: 0.00006, drag: 0.9975 });
    }
  }

  // ---- drawing ---------------------------------------------------------------------------------------------

  /** One frame of the table. */
  frame(ctx: Ctx, now: number, sc: Scene) {
    const st = this.stage;
    if (st.takeResize()) this.paint();
    if (!this.t0) this.t0 = now;
    const dt = this.prev ? Math.min(100, now - this.prev) : 16;
    this.prev = now;
    const age = now - this.t0;
    const still = calm();

    this.watch(sc, now);
    this.runBeat(sc, now);
    this.bits.step(dt, st.downX, st.downY);

    const live = this.live;
    const matchOn = sc.match && !this.end ? 1 : 0;
    this.mp += (matchOn - this.mp) * Math.min(1, dt / 260);
    if (sc.match) this.mpColor = sc.match === 3 ? PINK : SIDE_COLOR[sc.match - 1];
    this.meter += ((live ? Math.min(sc.rally, NET_DASHES / 2) : 0) - this.meter) * Math.min(1, dt / (live ? 60 : 160));
    this.countA += ((live && sc.rally >= COUNT_FROM ? 1 : 0) - this.countA) * Math.min(1, dt / (live ? 80 : 420));
    /** how near the rally is to boiling over, 0 to 1: from the eighth hit to the twentieth */
    const fever = live ? clamp01((sc.rally - 7) / 12) : 0;
    const heat = sc.ball ? this.heat : 0;

    // the camera: a shake, and at the last point a push in towards the wall the ball was lost against
    const cam = this.cam;
    const shakeLeft = (this.shakeEnd - now) / this.shakeMs;
    if (shakeLeft > 0) {
      const m = this.shakeMag * shakeLeft * shakeLeft;
      cam.dx = (Math.random() * 2 - 1) * m;
      cam.dy = (Math.random() * 2 - 1) * m;
    } else cam.dx = cam.dy = 0;
    const pf = (now - this.punch.t) / this.punch.ms;
    cam.zoom = pf >= 0 && pf < 1 ? 1 + this.punch.mag * Math.sin(Math.PI * Math.pow(pf, 0.6)) : 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, st.canvas.width, st.canvas.height);
    st.blit(ctx, this.base, cam);
    st.begin(ctx, cam);

    // the paddles slide in as the table comes on
    const slide = (1 - outCubic((age - 200) / 600)) * 16;
    const mineX = GAP - slide;
    const theirsX = W - GAP - PAD_W + slide;
    const litOf = (side: number) => {
      const lit = Math.max(0, 1 - (now - this.hits[side].t) / LIT_MS);
      if (this.end && this.end.mine === (side === 0)) return Math.max(lit, 0.16 + 0.1 * Math.sin(now / 480));
      return lit;
    };
    const lit0 = litOf(0);
    const lit1 = litOf(1);

    this.light(ctx, now, sc, lit0, lit1, heat, fever, still);
    if (!still) this.dust(ctx, now, dt);
    this.scores(ctx, now, sc);
    this.rails(ctx, now, fever, still);
    this.net(ctx, now, sc, still);
    this.ends(ctx, now, still);
    this.drawRings(ctx, now);
    this.counter(ctx, now);

    // the ball as it is drawn: held for a blink on a sharp hit or against the wall, then catching up
    const b = sc.ball;
    let bx = b ? b.x : 0;
    let by = b ? b.y : 0;
    let held = false;
    if (now < this.hold.until) {
      bx = this.hold.x;
      by = this.hold.y;
      held = true;
    } else if (b && live && now < this.hold.until + CATCH_MS) {
      const f = (now - this.hold.until) / CATCH_MS;
      bx = this.hold.x + (bx - this.hold.x) * f;
      by = this.hold.y + (by - this.hold.y) * f;
    }
    const lost = !!this.beat && this.beat.stage === 1;
    const showBall = lost || (!!b && !(this.beat && this.beat.stage >= 2));

    // the serve to come: the ball on the server's paddle, the way it will go, a ring closing in on it
    const lead = sc.first ? KICKOFF_MS - INTRO_MS : SHOW_MS;
    const serving = sc.serveIn >= 0 && !b && sc.serveIn <= lead && !this.end;
    if (serving) {
      if (!this.heldAt) this.heldAt = now;
      this.telegraph(ctx, now, sc, still);
    } else this.heldAt = 0;

    if (this.mp > 0.01) {
      ctx.globalAlpha = this.mp;
      st.blit(ctx, this.dusk, cam);
      ctx.globalAlpha = 1;
      st.begin(ctx, cam);
    }
    if (this.end) this.glory(ctx, now, still);
    if (lost && !still) {
      ctx.globalAlpha = this.beat!.final ? 0.46 : 0.26;
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // shadows first: they tell how high things are over the felt
    const sx = st.rightX + st.downX;
    const sy = st.rightY + st.downY;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.34;
    ctx.fillRect(st.snap(mineX + sx * 1.6), st.snap(sc.mine - PAD_H / 2 + sy * 1.6), PAD_W, PAD_H);
    ctx.fillRect(st.snap(theirsX + sx * 1.6), st.snap(sc.theirs - PAD_H / 2 + sy * 1.6), PAD_W, PAD_H);
    const h = b && !held ? lift(bx, b.vx > 0) : 0.3;
    if (showBall) {
      const off = 0.8 + h * 3.2;
      ctx.globalAlpha = Math.max(0.12, 0.36 - h * 0.14);
      ctx.fillRect(st.snap(bx - 1.5 + sx * off), st.snap(by - 1.5 + sy * off), 3, 3);
    }
    ctx.globalAlpha = 1;

    this.pad(ctx, 0, mineX, sc.mine, now, lit0, dt);
    this.pad(ctx, 1, theirsX, sc.theirs, now, lit1, dt);

    if (showBall) {
      const bh = lost ? 1 : heat;
      if (b && !lost) {
        if (!held) this.streak.push(bx, by, heat, now);
        this.streak.draw(ctx, (v) => st.snap(v), now, 110 + heat * 250 + fever * 120, 2.4 + heat * 0.8, 0.5 + heat * 0.3);
        if (heat > 0.4 && !still && !held) {
          this.emberDue += dt * (heat - 0.3) * 0.05;
          while (this.emberDue >= 1) {
            this.emberDue -= 1;
            this.bits.burst(bx, by, 1, 0.02, [hot(heat), "#ffffff"], { life: 300, size: 0.8 });
          }
        }
      }
      this.ball(ctx, bx, by, lost ? 1 : h, bh, lost);
    }
    if (serving) this.heldBall(ctx, now, sc);

    this.bits.draw(ctx, (v) => st.snap(v));

    // the flash over everything, and the table coming on at the very start
    const flashLeft = (this.flashEnd - now) / this.flashMs;
    if (flashLeft > 0) {
      ctx.globalAlpha = this.flashA * flashLeft;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-4, -4, W + 8, H + 8);
      ctx.globalAlpha = 1;
    }
    if (age < 700) {
      ctx.globalAlpha = 0.75 * (1 - age / 700);
      ctx.fillStyle = INK;
      ctx.fillRect(-4, -4, W + 8, H + 8);
      ctx.globalAlpha = 1;
    }
  }

  /** The light on the felt: the lamp over the middle, a pool from each paddle, the ball's own, the rally's heat. */
  private light(ctx: Ctx, now: number, sc: Scene, lit0: number, lit1: number, heat: number, fever: number, still: boolean) {
    const breath = still ? 0 : 0.015 * Math.sin(now / 1700);
    const hitAge = now - this.run.t;
    const answer = hitAge < 220 ? this.run.power * (1 - hitAge / 220) : 0;
    glow(ctx, W / 2, H / 2, 84, "#49e0b0", 0.07 + breath + answer * 0.05);
    if (fever > 0) glow(ctx, W / 2, H / 2, 70, hot(0.5 + fever * 0.5), fever * (0.1 + (still ? 0 : 0.03 * Math.sin(now / 90))));
    // a heart's two beats before a point that can end the match
    const hb = now - this.heart;
    if (hb < 620 && !still) {
      const beat = Math.max(0, 1 - hb / 200) + (hb > 220 ? Math.max(0, 1 - (hb - 220) / 260) * 0.8 : 0);
      glow(ctx, W / 2, H / 2, 64, this.mpColor, beat * 0.22);
    }
    glow(ctx, FACE_L + 12, sc.mine, 34, MINE, 0.12 + lit0 * 0.3);
    glow(ctx, FACE_R - 12, sc.theirs, 34, THEIRS, 0.12 + lit1 * 0.3);
    if (sc.ball && this.live) glow(ctx, sc.ball.x, sc.ball.y, 16 + heat * 10, hot(heat), 0.09 + heat * 0.13);
  }

  /** Dust in the lamp's light, drifting. */
  private dust(ctx: Ctx, now: number, dt: number) {
    ctx.fillStyle = "#d8fff2";
    for (const m of this.motes) {
      m.x = (m.x + m.vx * dt + W) % W;
      m.y = (m.y + m.vy * dt + H) % H;
      // brightest under the lamp, gone by the table's ends
      const near = 1 - Math.min(1, Math.abs(m.x - W / 2) / (W * 0.46));
      ctx.globalAlpha = near * (0.05 + 0.06 * (0.5 + 0.5 * Math.sin(now / 900 + m.ph)));
      ctx.fillRect(this.stage.snap(m.x), this.stage.snap(m.y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** The score in big dim digits on each half; the scorer's turns over like a flap and stays lit for a moment. */
  private scores(ctx: Ctx, now: number, sc: Scene) {
    const st = this.stage;
    // along the top of a lying table, in the middle of each half of a standing one
    const cy = st.tall ? H / 2 : 17;
    for (let i = 0; i < 2; i++) {
      const d = this.tally[i];
      const color = SIDE_COLOR[i];
      const cx = i ? (3 * W) / 4 : W / 4;
      const t = now - d.flipAt;
      let text = String(d.next);
      let sy = 1;
      let s = 1;
      if (t < FLIP_OUT_MS) {
        text = String(d.shown);
        sy = 1 - t / FLIP_OUT_MS;
      } else if (t < FLIP_OUT_MS + FLIP_IN_MS) {
        const f = (t - FLIP_OUT_MS) / FLIP_IN_MS;
        sy = outBack(f);
        s = 1 + 0.4 * (1 - f) * (1 - f);
      }
      const lit = t >= FLIP_OUT_MS ? Math.max(0, 1 - (t - FLIP_OUT_MS) / 1400) : 0;
      let a = 0.14 + lit * 0.8;
      if (this.end && this.end.mine === (i === 0)) a = Math.max(a, 0.6 + 0.18 * Math.sin(now / 520));
      else if (sc.match & (i + 1)) a += this.mp * (0.1 + 0.07 * Math.sin(now / 380));
      if (lit > 0.05) glow(ctx, cx, cy, 24, color, lit * 0.45);
      if (sy <= 0.02) continue;
      st.upright(ctx, cx, cy, s, s * sy);
      ctx.globalAlpha = Math.min(1, a);
      this.number(ctx, text, 3, color);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /** The rails: every hit runs along them the way the ball went, a ball coming off one lights the spot. */
  private rails(ctx: Ctx, now: number, fever: number, still: boolean) {
    const both = (x: number, w: number) => {
      ctx.fillRect(x, 0, w, 1);
      ctx.fillRect(x, H - 1, w, 1);
    };
    ctx.fillStyle = CHALK;
    ctx.globalAlpha = 0.9 - (still ? 0 : fever * 0.3 * Math.random());
    both(0, W);
    if (fever > 0) {
      ctx.fillStyle = hot(0.4 + fever * 0.6);
      ctx.globalAlpha = fever * 0.65;
      both(0, W);
    }
    if (this.mp > 0.01) {
      ctx.fillStyle = this.mpColor;
      ctx.globalAlpha = this.mp * (0.5 + (still ? 0 : 0.22 * Math.sin(now / 420)));
      both(0, W);
    }
    const age = now - this.run.t;
    if (age < RUN_MS) {
      const { way, power, color } = this.run;
      const head = (way > 0 ? FACE_L : FACE_R) + way * age * RUN_SPEED;
      const fade = power * (1 - age / RUN_MS);
      ctx.fillStyle = color;
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = fade * (1 - i / 6);
        both(way > 0 ? head - (i + 1) * 5 : head + i * 5, 5);
      }
      ctx.globalAlpha = 1;
      glow(ctx, head, 0.5, 9, color, fade * 0.55);
      glow(ctx, head, H - 0.5, 9, color, fade * 0.55);
    }
    for (let i = 0; i < this.knocks.length; ) {
      const k = this.knocks[i];
      const f = 1 - (now - k.t) / KNOCK_MS;
      if (f <= 0) {
        this.knocks.splice(i, 1);
        continue;
      }
      const y = k.top ? 0 : H - 1;
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = f;
      ctx.fillRect(k.x - 6, y, 12, 1);
      ctx.globalAlpha = 1;
      glow(ctx, k.x, y + 0.5, 10, MINT, f * 0.5);
      i++;
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The net is the rally's gauge: a pair of dashes lights for every hit, from the middle outwards, in the colour of
   * the ball's heat; a hit kicks it the way the ball went, and a point's ripple runs through it.
   */
  private net(ctx: Ctx, now: number, sc: Scene, still: boolean) {
    const kickAge = now - this.run.t;
    const kick = kickAge < 200 && !still ? this.run.way * (0.6 + this.run.power) * Math.exp(-kickAge / 70) * Math.cos(kickAge / 22) : 0;
    const ripple = this.wall && now - this.wall.t < 820 ? this.wall : null;
    const heatColor = hot(clamp01(sc.rally / 14));
    const wide = this.meter >= 7.5;
    for (let i = 0; i < NET_DASHES; i++) {
      const y = 3 + i * 6;
      const rank = Math.floor(Math.abs(i - (NET_DASHES - 1) / 2));
      const on = clamp01(this.meter - rank);
      let x = W / 2 - 0.5 + kick * (0.35 + 0.65 * on);
      if (ripple && !still) {
        const d = Math.hypot(W / 2 - (ripple.side ? W : 0), y + 1.5 - ripple.y);
        const r = 4 + 186 * outCubic((now - ripple.t) / 820);
        const near = 1 - Math.abs(d - r) / 12;
        if (near > 0) x += (ripple.side ? -1 : 1) * near * 2.4;
      }
      let color: string = CHALK;
      let a = 0.6;
      if (this.end) {
        color = SIDE_COLOR[this.end.mine ? 0 : 1];
        a = still ? 0.8 : 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(now / 260 - rank * 0.7));
      } else if (this.mp > 0.5 && on < 0.5) {
        color = this.mpColor;
        a = 0.5;
      }
      ctx.fillStyle = color;
      ctx.globalAlpha = a;
      ctx.fillRect(this.stage.snap(x), y, 1, 3);
      if (on > 0 && !this.end) {
        ctx.fillStyle = heatColor;
        ctx.globalAlpha = on;
        ctx.fillRect(this.stage.snap(x - (wide ? 0.5 : 0)), y, wide ? 2 : 1, 3);
        ctx.globalAlpha = 1;
        glow(ctx, x + 0.5, y + 1.5, 5 + (wide ? 2 : 0), heatColor, on * (0.26 + (kickAge < 200 ? 0.3 * (1 - kickAge / 200) : 0)));
      }
    }
    ctx.globalAlpha = 1;
    // the posts the net hangs between, one on each rail
    for (const y of [0, H - 3]) {
      ctx.fillStyle = INK;
      ctx.fillRect(W / 2 - 2, y, 3, 3);
      ctx.fillStyle = this.end ? SIDE_COLOR[this.end.mine ? 0 : 1] : this.mp > 0.5 ? this.mpColor : CHALK;
      ctx.fillRect(W / 2 - 1.5, y + 0.5, 2, 2);
    }
    // a rally about to boil over spits sparks off the net
    const fever = this.live ? clamp01((sc.rally - 13) / 8) : 0;
    if (fever > 0 && !still && Math.random() < fever * 0.22) {
      this.bits.burst(W / 2, 6 + Math.random() * (H - 12), 1, 0.05, [heatColor, "#ffffff"], { life: 260, size: 0.8 });
    }
  }

  /** The end walls, each in its own player's colour; the one a ball was lost against is lit in the scorer's. */
  private ends(ctx: Ctx, now: number, still: boolean) {
    for (let side = 0; side < 2; side++) {
      ctx.fillStyle = SIDE_COLOR[side];
      // each end is its player's: their colour on the wall, and a wash of it over the gutter behind their paddle
      for (let i = 0; i < FACE_L; i++) {
        const f = 1 - i / FACE_L;
        ctx.globalAlpha = i ? 0.13 * f * f : 0.42;
        ctx.fillRect(side ? W - 1 - i : i, 1, 1, H - 2);
      }
      const w = this.wall;
      if (!w || w.side !== side) continue;
      const age = now - w.t;
      if (age >= WALL_MS) continue;
      const blink = !still && age < 360 && Math.floor(age / 60) % 2 ? 0.5 : 1;
      const a = (1 - age / WALL_MS) * blink;
      ctx.fillStyle = w.color;
      for (let i = 0; i < 12; i++) {
        const f = 1 - i / 12;
        ctx.globalAlpha = a * f * f * (i ? 0.6 : 1);
        ctx.fillRect(side ? W - 1 - i : i, 1, 1, H - 2);
      }
      ctx.globalAlpha = 1;
      glow(ctx, side ? W : 0, w.y, 32, w.color, a * 0.7);
    }
    ctx.globalAlpha = 1;
  }

  private drawRings(ctx: Ctx, now: number) {
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.rings.length; ) {
      const g = this.rings[i];
      const f = (now - g.t) / g.ms;
      if (f >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      i++;
      if (f < 0) continue;
      const r = g.r0 + (g.r1 - g.r0) * outCubic(f);
      ctx.globalAlpha = g.a * (1 - f) * (1 - f);
      ring(ctx, g.x, g.y, r, g.color);
      if (g.r1 > 60) {
        ctx.globalAlpha *= 0.45;
        ring(ctx, g.x, g.y, Math.max(1, r - 2), g.color);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = op;
  }

  /** The rally's count on a small plate at the top of the net; it jumps with every hit. */
  private counter(ctx: Ctx, now: number) {
    if (this.countA < 0.02 || this.count < COUNT_FROM) return;
    const text = String(this.count);
    const cell = 1.5;
    const w = digitsW(text, cell);
    const pop = 1 + 0.5 * Math.max(0, 1 - (now - this.countPop) / 150);
    const color = hot(clamp01(this.count / 14));
    this.stage.upright(ctx, W / 2, 9.5, pop, pop);
    ctx.globalAlpha = this.countA * 0.8;
    ctx.fillStyle = INK;
    ctx.fillRect(-w / 2 - 2.5, -6, w + 5, 12);
    ctx.fillStyle = color;
    ctx.globalAlpha = this.countA * 0.55;
    ctx.fillRect(-w / 2 - 2.5, 5, w + 5, 1);
    ctx.globalAlpha = this.countA;
    ctx.translate(0, -0.5);
    this.number(ctx, text, cell, color);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Where the ball waits before a serve: on the server's paddle, wherever that is held. */
  private heldSpot(sc: Scene): [number, number] {
    const y = Math.max(R + 1, Math.min(H - R - 1, sc.server ? sc.theirs : sc.mine));
    return [sc.server ? FACE_R - R - 1 : FACE_L + R + 1, y];
  }

  /** The way the serve will go, in dots marching off the ball, and a ring that closes on it as the serve comes. */
  private telegraph(ctx: Ctx, now: number, sc: Scene, still: boolean) {
    const [x0, y0] = this.heldSpot(sc);
    const color = SIDE_COLOR[sc.server];
    const shown = now - this.heldAt;
    if (sc.aim) {
      const v = Math.hypot(sc.aim.vx, sc.aim.vy) || 1;
      const ux = sc.aim.vx / v;
      let uy = sc.aim.vy / v;
      const reach = 58 * outCubic((shown - 120) / 420);
      const march = still ? 0 : (now / 45) % 4;
      let x = x0;
      let y = y0;
      let d = 0;
      const urgent = sc.serveIn < 300 && !still && Math.floor(now / 70) % 2 === 0;
      ctx.fillStyle = color;
      for (let step = 0; d < reach; step++) {
        const go = step === 0 ? 4 + march : 4;
        x += ux * go;
        y += uy * go;
        d += go;
        if (y < R) {
          y = 2 * R - y;
          uy = -uy;
        } else if (y > H - R) {
          y = 2 * (H - R) - y;
          uy = -uy;
        }
        if (d > reach) break;
        ctx.globalAlpha = (urgent ? 0.95 : 0.62) * (1 - (d / 58) * 0.75);
        ctx.fillRect(this.stage.snap(x - 0.5), this.stage.snap(y - 0.5), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    if (sc.serveIn < 720) {
      const f = sc.serveIn / 720;
      const op = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.25 + 0.65 * (1 - f);
      ring(ctx, x0, y0, 3 + 8 * f, color);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = op;
    }
  }

  private heldBall(ctx: Ctx, now: number, sc: Scene) {
    const [x, y] = this.heldSpot(sc);
    const grow = outBack((now - this.heldAt) / 180);
    glow(ctx, x, y, 8, "#ffffff", 0.3 * grow);
    this.ball(ctx, x, y, 0.2, 0, false, grow);
  }

  /**
   * The ball: a little bigger the higher it is over the table, a hot rim round it as a rally heats up, white all
   * through for the blink it is held against the wall it was lost at.
   */
  private ball(ctx: Ctx, x: number, y: number, h: number, heat: number, lost: boolean, grow = 1) {
    const st = this.stage;
    const half = st.snap(((3 + Math.max(0, h) * 0.75) * grow) / 2);
    if (half <= 0) return;
    glow(ctx, x, y, 7 + heat * 6 + (lost ? 8 : 0), lost ? "#ffffff" : hot(heat), 0.3 + heat * 0.35 + (lost ? 0.4 : 0));
    st.upright(ctx, st.snap(x), st.snap(y));
    const z = half * 2;
    if (heat > 0.25 || lost) {
      ctx.fillStyle = lost ? "#ffffff" : hot(heat);
      ctx.globalAlpha = lost ? 0.7 : Math.min(0.9, (heat - 0.25) * 1.3);
      ctx.fillRect(-half - 1, -half - 1, z + 2, z + 2);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-half - 0.5, -half - 0.5, z + 1, z + 1);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = BALL;
    ctx.fillRect(-half, -half, z, z);
    if (!lost) {
      ctx.fillStyle = "#c9bfa8";
      ctx.fillRect(half - 1, -half + 1, 1, z - 1);
      ctx.fillRect(-half + 1, half - 1, z - 1, 1);
    }
    ctx.fillStyle = "#ffffff";
    if (lost || heat > 0.02) {
      ctx.globalAlpha = lost ? 1 : heat * 0.85;
      ctx.fillRect(-half, -half, z, z);
      ctx.globalAlpha = 1;
    }
    ctx.fillRect(-half, -half, 1, 1);
    ctx.restore();
  }

  /**
   * A paddle, drawn row by row so that it can give: a hit springs it back where the ball struck, wide and soft off
   * its middle, a short hard kink off its tip. The tips are a lighter shade, the part that sends a ball back sharp.
   */
  private pad(ctx: Ctx, side: number, x: number, y: number, now: number, lit: number, dt: number) {
    const st = this.stage;
    const color = SIDE_COLOR[side];
    const inner = side ? -1 : 1;
    const top = st.snap(y - PAD_H / 2);
    const hit = this.hits[side];
    const age = now - hit.t;
    const spring = age < SPRING_MS && !calm() ? hit.power * Math.exp(-age / 80) * Math.cos(age / 27) : 0;
    const sigma = hit.tip ? 3.4 : 7.5;

    // a paddle moved fast leaves a fading double behind it
    const ghost = this.padGhost[side];
    const moved = y - this.padWas[side];
    this.padGhost[side] = Math.abs(moved) > 1.2 ? this.padWas[side] : ghost + (y - ghost) * Math.min(1, dt / 50);
    this.padWas[side] = y;
    const lag = y - this.padGhost[side];
    if (Math.abs(lag) > 1.5) {
      ctx.fillStyle = color;
      ctx.globalAlpha = Math.min(0.3, Math.abs(lag) * 0.03);
      ctx.fillRect(x, st.snap(y - PAD_H / 2 - lag * 0.55), PAD_W, PAD_H);
      ctx.globalAlpha = 1;
    }

    glow(ctx, x + PAD_W / 2, y, PAD_H * 0.8, color, 0.22 + lit * 0.45);
    const bend = (row: number) => {
      const d = y - PAD_H / 2 + row + 0.5 - hit.y;
      return st.snap(x - inner * spring * Math.exp(-(d * d) / (2 * sigma * sigma)));
    };
    ctx.fillStyle = INK;
    ctx.fillRect(bend(0) - 1, top - 1, PAD_W + 2, 1);
    ctx.fillRect(bend(PAD_H - 1) - 1, top + PAD_H, PAD_W + 2, 1);
    for (let row = 0; row < PAD_H; row++) ctx.fillRect(bend(row) - 1, top + row, PAD_W + 2, 1);
    for (let row = 0; row < PAD_H; row++) {
      const rx = bend(row);
      const ry = top + row;
      const tip = row < 2 || row >= PAD_H - 2;
      ctx.fillStyle = color;
      ctx.fillRect(rx, ry, PAD_W, 1);
      ctx.fillStyle = tip ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.5)";
      ctx.fillRect(inner > 0 ? rx + PAD_W - 1 : rx, ry, 1, 1);
      if (tip) {
        ctx.fillStyle = "rgba(255,255,255,0.38)";
        ctx.fillRect(rx, ry, PAD_W, 1);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.26)";
        ctx.fillRect(inner > 0 ? rx : rx + PAD_W - 1, ry, 1, 1);
      }
    }
    if (lit > 0) {
      ctx.globalAlpha = lit;
      ctx.fillStyle = "#ffffff";
      for (let row = 0; row < PAD_H; row++) ctx.fillRect(bend(row), top + row, PAD_W, 1);
      ctx.globalAlpha = 1;
    }
  }

  /** The match is over: the loser's half goes dim, the winner's stays lit, and embers drift up from the winner's end. */
  private glory(ctx: Ctx, now: number, still: boolean) {
    const end = this.end!;
    const e = clamp01((now - end.at) / 600);
    const color = SIDE_COLOR[end.mine ? 0 : 1];
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.42 * e;
    ctx.fillRect(end.mine ? W / 2 + 1 : 0, 0, W / 2 - 1, H);
    ctx.globalAlpha = 1;
    const cx = end.mine ? W * 0.25 : W * 0.75;
    glow(ctx, cx, H / 2, 66, color, e * (0.24 + (still ? 0 : 0.05 * Math.sin(now / 700))));
    if (still || now - this.emberAt < 120) return;
    this.emberAt = now;
    this.bits.burst(end.mine ? 2 : W - 2, 4 + Math.random() * (H - 8), 1, 0.03, [color, color, "#ffffff"], {
      dir: end.mine ? 0 : Math.PI,
      spread: 1.2,
      life: 2400,
      size: Math.random() < 0.3 ? 1.4 : 0.9,
      fall: -0.000012,
      drag: 0.9993,
    });
  }

  dispose() {
    this.stage.dispose();
  }
}
