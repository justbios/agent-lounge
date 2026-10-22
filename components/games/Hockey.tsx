"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { tr, uiNow, useTr } from "@/lib/i18n";
import { Match, Side, sideOf } from "@/lib/live/duel";
import { GameLink, devLag } from "@/lib/live/gameLink";
import { Aim, FIRST_STEPS, GOAL_W, H, HOCKEY, MALLET_R, PUCK_R, STEP_MS, W, WIN_AT, aimAt } from "@/lib/live/hockey";
import { Netplay } from "@/lib/live/netplay";
import { sfx } from "@/lib/live/sfx";
import { supabase } from "@/lib/supabaseClient";
import { shade } from "../cafe/pixel";
import { ArcadeHud, ArcadeSay, ArcadeScreen, Final, lineSay } from "./Arcade";
import { Ctx, Cues, INK, Jolt, MINE, Screen, Sparks, THEIRS, Trail, bump, countdown, disc, glow, pop, ring } from "./fx";

const QUIET_MS = 1500;
const KEY_SPEED = 0.12;
const RED = "#e0525e";
const BLUE = "#4aa3e0";
const PUCK = "#f1ebdb";
/** the table's rail round the play area, units */
const RAIL = 5;
/** a goal light stays on this long */
const LIT_MS = 1500;
/** a hit or a bounce sounds at most this often */
const CLICK_MS = 70;
/** the final goal's cheer first, then the fanfare */
const FANFARE_MS = 650;
const CONFETTI = ["#ffd25a", "#8fb3ff", "#ff7aa8", "#7ef0c2", "#ffffff", "#c9a6ff"];
const MOVES: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  w: [0, -1],
  ArrowDown: [0, 1],
  s: [0, 1],
  ArrowLeft: [-1, 0],
  a: [-1, 0],
  ArrowRight: [1, 0],
  d: [1, 0],
};

/** The table: a rail with a violet light along its inside, the blue play field with its air holes, lines and goals. */
function drawTable(ctx: Ctx, k: number) {
  const out = W + 2 * RAIL;
  const tall = H + 2 * RAIL;
  ctx.fillStyle = INK;
  ctx.fillRect(-RAIL, -RAIL, out, tall);
  ctx.fillStyle = "#3a3157";
  ctx.fillRect(-RAIL + 1, -RAIL + 1, out - 2, tall - 2);
  ctx.fillStyle = "#5a4d86";
  ctx.fillRect(-RAIL + 1, -RAIL + 1, out - 2, 1);
  ctx.fillRect(-RAIL + 1, -RAIL + 1, 1, tall - 2);
  ctx.fillStyle = "#262039";
  ctx.fillRect(-RAIL + 1, H + RAIL - 2, out - 2, 1);
  ctx.fillRect(W + RAIL - 2, -RAIL + 1, 1, tall - 2);

  ctx.save();
  ctx.shadowColor = "#9b7bff";
  ctx.shadowBlur = 3 * k;
  ctx.fillStyle = "#a58bff";
  ctx.fillRect(-2, -2, W + 4, 1);
  ctx.fillRect(-2, H + 1, W + 4, 1);
  ctx.fillRect(-2, -2, 1, H + 4);
  ctx.fillRect(W + 1, -2, 1, H + 4);
  ctx.restore();
  ctx.fillStyle = INK;
  ctx.fillRect(-1, -1, W + 2, 1);
  ctx.fillRect(-1, H, W + 2, 1);
  ctx.fillRect(-1, -1, 1, H + 2);
  ctx.fillRect(W, -1, 1, H + 2);

  const field = ctx.createRadialGradient(W / 2, H / 2, 8, W / 2, H / 2, H * 0.72);
  field.addColorStop(0, "#1f5a8c");
  field.addColorStop(1, "#0e2b49");
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, W, H);
  for (let y = 3, row = 0; y < H; y += 6, row++) {
    for (let x = row % 2 ? 6 : 3; x < W; x += 6) {
      ctx.fillStyle = "#0b2036";
      ctx.fillRect(x, y, 0.75, 0.75);
      ctx.fillStyle = "#2b6c9f";
      ctx.fillRect(x, y + 0.75, 0.75, 0.25);
    }
  }

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = RED;
  ctx.fillRect(0, H / 2 - 0.5, W, 1);
  ring(ctx, W / 2, H / 2, 14, RED);
  disc(ctx, W / 2, H / 2, 1, RED);
  for (const fy of [H / 4, (3 * H) / 4]) {
    ctx.fillStyle = RED;
    ctx.fillRect(W / 2 - 23, fy - 0.5, 2, 1);
    ctx.fillRect(W / 2 + 21, fy - 0.5, 2, 1);
  }
  ctx.globalAlpha = 0.7;
  ring(ctx, W / 2, 0, GOAL_W / 2 + 6, BLUE, 0, Math.PI);
  ring(ctx, W / 2, H, GOAL_W / 2 + 6, BLUE, Math.PI, Math.PI * 2);
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, H * 0.3, W, 0.5);
  ctx.fillRect(0, H * 0.7 - 0.5, W, 0.5);
  ctx.globalAlpha = 1;

  for (const [y0, dir, color] of [
    [-RAIL, 1, THEIRS],
    [H, -1, MINE],
  ] as const) {
    const x0 = W / 2 - GOAL_W / 2;
    ctx.fillStyle = INK;
    ctx.fillRect(x0, y0, GOAL_W, RAIL);
    ctx.fillStyle = "#1d1730";
    for (let i = dir > 0 ? 0 : 1; i < RAIL; i += 2) ctx.fillRect(x0 + 1, y0 + i, GOAL_W - 2, 0.5);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 4 * k;
    ctx.fillStyle = color;
    ctx.fillRect(x0, dir > 0 ? -1 : H, GOAL_W, 1);
    ctx.restore();
    for (const px of [x0 - 2, x0 + GOAL_W]) {
      ctx.fillStyle = "#e9f2ea";
      ctx.fillRect(px, y0, 2, RAIL);
      ctx.fillStyle = "#9aa6b8";
      ctx.fillRect(px + 1, y0, 1, RAIL);
    }
  }
}

/** A mallet seen from above: a rim in its colour, lit from the top left, a raised knob in the middle, a shadow. */
function paintMallet(ctx: Ctx, color: string) {
  const c = MALLET_R + 2.5;
  ctx.globalAlpha = 0.4;
  disc(ctx, c + 1, c + 2, MALLET_R, INK);
  ctx.globalAlpha = 1;
  disc(ctx, c, c, MALLET_R, INK);
  disc(ctx, c, c, MALLET_R - 1, shade(color, 0.72));
  disc(ctx, c - 1, c - 1, MALLET_R - 2, color);
  ring(ctx, c, c, MALLET_R - 2, shade(color, 1.3), Math.PI * 1.1, Math.PI * 1.45);
  disc(ctx, c, c, 3, shade(color, 0.55));
  disc(ctx, c, c, 2, shade(color, 1.18));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(c - 1.5, c - 1.5, 1, 1);
}

/** The puck: cream with a darker groove and a glint. */
function paintPuck(ctx: Ctx) {
  const c = PUCK_R + 2.5;
  ctx.globalAlpha = 0.4;
  disc(ctx, c + 1, c + 2, PUCK_R, INK);
  ctx.globalAlpha = 1;
  disc(ctx, c, c, PUCK_R, INK);
  disc(ctx, c, c, PUCK_R - 1, PUCK);
  ring(ctx, c, c, 2, "#c4b99f");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(c - 2.5, c - 2.5, 2, 1);
}

interface Spot {
  x: number;
  y: number;
}

interface Moving extends Spot {
  vx: number;
  vy: number;
}

/**
 * What the table looks like, apart from the game's rules: drawn the way this viewer sees it, their end at the bottom.
 * It notices hits and bounces by the puck's sudden turns, so it shows them on either half alike.
 */
export class HockeyView {
  readonly screen: Screen;
  private bg!: HTMLCanvasElement;
  private mine!: HTMLCanvasElement;
  private theirs!: HTMLCanvasElement;
  private puck!: HTMLCanvasElement;
  private readonly sparks = new Sparks();
  private readonly trail = new Trail(9);
  private readonly jolt = new Jolt();
  private lit = { y: 0, color: MINE, end: 0 };
  private had = false;
  private pvx = 0;
  private pvy = 0;
  private hitAt = 0;
  private wallAt = 0;
  private prev = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.screen = new Screen(canvas, W, H, RAIL);
    this.paint();
  }

  private paint() {
    const s = this.screen;
    this.bg = s.layer((ctx) => drawTable(ctx, s.k));
    this.mine = s.sprite(2 * MALLET_R + 5, (ctx) => paintMallet(ctx, MINE));
    this.theirs = s.sprite(2 * MALLET_R + 5, (ctx) => paintMallet(ctx, THEIRS));
    this.puck = s.sprite(2 * PUCK_R + 5, paintPuck);
  }

  /** A goal: the light over the net it went into, sparks out of it, the table shaking. */
  goal(mine: boolean, now: number) {
    const y = mine ? 0 : H;
    const color = mine ? MINE : THEIRS;
    this.lit = { y, color, end: now + LIT_MS };
    this.sparks.burst(W / 2, y, 48, 0.13, [color, "#ffffff", shade(color, 1.3)], {
      dir: mine ? Math.PI / 2 : -Math.PI / 2,
      spread: 2.6,
      life: 750,
      size: 1.2,
      drag: 0.994,
    });
    this.jolt.shake(2.6, 420, now);
    this.jolt.flash(color, 0.25, 320, now);
    this.trail.clear();
  }

  /** The match is over: confetti for the winner. */
  end(win: boolean) {
    if (!win) return;
    for (const x of [6, W / 2, W - 6]) {
      this.sparks.burst(x, -2, 60, 0.1, CONFETTI, {
        dir: Math.PI / 2,
        spread: 2.2,
        life: 3200,
        size: 1.5,
        fall: 0.00008,
        drag: 0.997,
      });
    }
  }

  private watch(p: Moving | null, mine: Spot, theirs: Spot, now: number) {
    if (!p) {
      this.had = false;
      this.trail.clear();
      return;
    }
    if (this.had && Math.abs(p.vx - this.pvx) + Math.abs(p.vy - this.pvy) > 0.03) {
      const dm = Math.hypot(p.x - mine.x, p.y - mine.y);
      const dt = Math.hypot(p.x - theirs.x, p.y - theirs.y);
      const near = Math.min(dm, dt);
      const speed = Math.hypot(p.vx, p.vy);
      if (near < PUCK_R + MALLET_R + 4) {
        const m = dm <= dt ? mine : theirs;
        const power = Math.min(1, speed / 0.2);
        const a = Math.atan2(p.y - m.y, p.x - m.x);
        const cx = m.x + Math.cos(a) * MALLET_R;
        const cy = m.y + Math.sin(a) * MALLET_R;
        this.sparks.burst(cx, cy, 5 + Math.round(power * 12), 0.04 + power * 0.08, [dm <= dt ? MINE : THEIRS, "#ffffff"], {
          dir: a,
          spread: 2.2,
          life: 300,
        });
        if (power > 0.7) this.jolt.shake(0.7, 140, now);
        if (now - this.hitAt > CLICK_MS) {
          this.hitAt = now;
          sfx("hit");
        }
      } else if (speed > 0.02) {
        const wx = p.x < W / 2 ? 0 : W;
        const wy = p.y < H / 2 ? 0 : H;
        const side = Math.min(p.x, W - p.x) < Math.min(p.y, H - p.y);
        this.sparks.burst(side ? wx : p.x, side ? p.y : wy, 4, 0.05, ["#cfe9ff", "#ffffff"], { life: 220 });
        if (now - this.wallAt > CLICK_MS) {
          this.wallAt = now;
          sfx("wall");
        }
      }
    }
    this.had = true;
    this.pvx = p.vx;
    this.pvy = p.vy;
  }

  /** One frame; the puck, its speed and both mallets as this viewer sees them. */
  frame(ctx: Ctx, now: number, p: Moving | null, mine: Spot, theirs: Spot) {
    const s = this.screen;
    if (s.takeResize()) this.paint();
    const dt = this.prev ? Math.min(100, now - this.prev) : 16;
    this.prev = now;
    this.watch(p, mine, theirs, now);
    this.sparks.step(dt);
    this.jolt.update(now);
    const { dx, dy } = this.jolt;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
    s.blit(ctx, this.bg, dx, dy);
    s.begin(ctx, dx, dy);

    const left = (this.lit.end - now) / LIT_MS;
    if (left > 0) glow(ctx, W / 2, this.lit.y, 26, this.lit.color, left * (0.65 + 0.35 * Math.sin(now / 55)));
    glow(ctx, theirs.x, theirs.y, 13, THEIRS, 0.22);
    glow(ctx, mine.x, mine.y, 13, MINE, 0.22);
    if (p) {
      this.trail.push(p.x, p.y);
      this.trail.draw(ctx, s, "#bfe6ff", PUCK_R * 1.7, Math.min(0.5, Math.hypot(p.vx, p.vy) * 3.5));
    }
    s.stamp(ctx, this.theirs, theirs.x, theirs.y);
    s.stamp(ctx, this.mine, mine.x, mine.y);
    if (p) {
      glow(ctx, p.x, p.y, 9, "#ffffff", 0.16);
      s.stamp(ctx, this.puck, p.x, p.y);
    }
    this.sparks.draw(ctx, s);
    this.jolt.overlay(ctx, -RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, now);
  }

  dispose() {
    this.screen.dispose();
  }
}

/** How far a correction still shows, eased off by half every SMOOTH_MS; a jump this big is a new puck, not a fix. */
const SMOOTH_MS = 35;
const SNAP = 20;

/**
 * Air hockey as rollback: each screen plays the whole table from both players' aims, its own player's mallet with no
 * wait at all and the other one guessed until their aim arrives, then quietly corrected. A goal counts once both
 * screens are sure of it.
 */
export default function Hockey({
  match,
  self,
  room,
  note,
  onEnd,
}: {
  match: Match;
  self: string;
  room: string | null;
  /** why the game stopped: the other player left or closed it */
  note: string | null;
  onEnd: (win: boolean) => void;
}) {
  const t = useTr();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mineRef = useRef<HTMLElement>(null);
  const theirsRef = useRef<HTMLElement>(null);
  const sayRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const stopRef = useRef(!!note);
  const [result, setResult] = useState<Final | null>(null);
  const [tally, setTally] = useState<[number, number]>([0, 0]);
  const end = useEffectEvent(onEnd);
  const { id } = match;
  const me: Side = sideOf(match, self) ?? "o";
  const ids = `${match.x.id} ${match.o.id}`;

  useEffect(() => {
    stopRef.current = !!note;
  }, [note]);

  useEffect(() => {
    const sb = supabase;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!sb || !canvas || !ctx || !room) return;
    const view = new HockeyView(canvas);
    const cues = new Cues();
    const seat = me === "x" ? 0 : 1;
    const rival = 1 - seat;
    const seats = ids.split(" ");
    const link = new GameLink(sb, `relay-game:${room}:${id}`, self, seats, (from, m) => net.receive(from, m), devLag());
    const net = new Netplay(HOCKEY, seats, self, link);
    const keys = new Set<string>();
    const home = HOCKEY.idle(seat);
    let pointer = { x: home.x, y: home.y };
    const off = { px: 0, py: 0, mx: 0, my: 0 };
    const sp = { x: 0, y: 0, vx: 0, vy: 0 };
    const sm = { x: 0, y: 0 };
    const st = { x: 0, y: 0 };
    const seen = [0, 0];
    let began = false;
    let over = false;
    let quiet = false;
    let lineAt = 0;
    let raf = 0;
    let prev = 0;

    const say = (s: string) => {
      if (sayRef.current) sayRef.current.textContent = s;
    };
    const sayT = (uk: string, en: string) => say(tr(uiNow(), uk, en));
    sayT("чекаю на суперника…", "waiting for the other player…");

    net.game.onRewind = (was, now) => {
      if (was.puck && now.puck) {
        off.px += was.puck.x - now.puck.x;
        off.py += was.puck.y - now.puck.y;
      }
      off.mx += was.mal[rival].x - now.mal[rival].x;
      off.my += was.mal[rival].y - now.mal[rival].y;
      if (Math.abs(off.px) + Math.abs(off.py) > SNAP) off.px = off.py = 0;
    };

    /** the goals and the end, from the game both screens are sure of */
    const settle = () => {
      const s = net.game.sure;
      const now = performance.now();
      for (const k of [0, 1]) {
        if (s.score[k] <= seen[k]) continue;
        seen[k] = s.score[k];
        const ours = k === seat;
        view.goal(ours, now);
        bump(ours ? mineRef.current : theirsRef.current);
        pop(popRef.current, tr(uiNow(), "ГОЛ!", "GOAL!"), ours ? MINE : THEIRS, 900);
        sfx(ours ? "goal" : "conceded");
      }
      setTally((p) => (p[0] === s.score[seat] && p[1] === s.score[rival] ? p : [s.score[seat], s.score[rival]]));
      if (s.over && !over) {
        over = true;
        const win = s.score[seat] >= WIN_AT;
        setResult({ win, mine: s.score[seat], theirs: s.score[rival] });
        end(win);
        cues.at(now + FANFARE_MS, () => {
          view.end(win);
          sfx(win ? "win" : "lose");
        });
      }
    };

    const flip = me === "x" ? 1 : -1;
    const tx = (x: number) => (me === "x" ? x : W - x);
    const ty = (y: number) => (me === "x" ? y : H - y);
    const input = (): Aim => {
      if (!keys.size) return aimAt(me, pointer.x, pointer.y);
      let kx = 0;
      let ky = 0;
      keys.forEach((k) => {
        kx += MOVES[k]?.[0] ?? 0;
        ky += MOVES[k]?.[1] ?? 0;
      });
      const m = net.game.state.mal[seat];
      const a = aimAt(me, m.x + kx * flip * KEY_SPEED * STEP_MS * 2, m.y + ky * flip * KEY_SPEED * STEP_MS * 2);
      pointer = a;
      return a;
    };
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const draw = (now: number) => {
      const s = net.game.state;
      const p0 = net.prev;
      const k = net.between(now);
      const p = s.puck;
      if (p) {
        const q = p0.puck ?? p;
        sp.x = tx(lerp(q.x, p.x, k) + off.px);
        sp.y = ty(lerp(q.y, p.y, k) + off.py);
        sp.vx = p.vx * flip;
        sp.vy = p.vy * flip;
      } else off.px = off.py = 0;
      sm.x = tx(lerp(p0.mal[seat].x, s.mal[seat].x, k));
      sm.y = ty(lerp(p0.mal[seat].y, s.mal[seat].y, k));
      st.x = tx(lerp(p0.mal[rival].x, s.mal[rival].x, k) + off.mx);
      st.y = ty(lerp(p0.mal[rival].y, s.mal[rival].y, k) + off.my);
      view.frame(ctx, now, p && sp, sm, st);
    };

    const point = (e: PointerEvent) => {
      const at = view.screen.at(e);
      pointer = { x: tx(at.x), y: ty(at.y) };
      keys.clear();
    };
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (over || typing || !MOVES[e.key.length === 1 ? e.key.toLowerCase() : e.key]) return;
      keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    canvas.addEventListener("pointermove", point);
    canvas.addEventListener("pointerdown", point);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    const loop = () => {
      const now = performance.now();
      const dt = prev ? Math.min(100, now - prev) : 16;
      prev = now;
      if (stopRef.current) cues.clear();
      cues.run(now);
      if (!stopRef.current && !over) {
        net.run(now, input);
        if (net.started && !began) {
          began = true;
          countdown(cues, () => popRef.current, now, now + FIRST_STEPS * STEP_MS);
          if (me === "x") sayT("шайба твоя: бий її битою", "your puck: hit it with your mallet");
          else sayT("готуйся, шайба в суперника", "get ready, their puck");
          cues.at(now + FIRST_STEPS * STEP_MS + 2000, () => !quiet && say(""));
        }
        const stuck = !!net.stalledSince && now - net.stalledSince > QUIET_MS;
        if (stuck !== quiet) {
          quiet = stuck;
          if (stuck) sayT("суперник не відповідає…", "the other player is not answering…");
          else say("");
        }
        settle();
      }
      if (now - lineAt > 1000 && lineRef.current && net.started) {
        lineAt = now;
        lineRef.current.textContent = lineSay(link);
      }
      const fade = Math.pow(0.5, dt / SMOOTH_MS);
      off.px *= fade;
      off.py *= fade;
      off.mx *= fade;
      off.my *= fade;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    draw(performance.now());
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", point);
      canvas.removeEventListener("pointerdown", point);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      view.dispose();
      link.close();
    };
  }, [id, ids, me, room, self]);

  const rival = me === "x" ? match.o : match.x;
  const verdict =
    result === null
      ? null
      : result.win
        ? t("перемога твоя!", "you win!")
        : t(`перемога: ${rival.name}`, `${rival.name} wins`);
  return (
    <div className="pong hockey">
      <ArcadeHud
        rival={rival.name}
        winAt={WIN_AT}
        mine={tally[0]}
        theirs={tally[1]}
        mineRef={mineRef}
        theirsRef={theirsRef}
      />
      <ArcadeSay>{verdict ?? note ?? <span ref={sayRef} />}</ArcadeSay>
      <ArcadeScreen popRef={popRef} final={result} rival={rival.name} lineRef={lineRef}>
        <canvas
          ref={canvasRef}
          width={(W + 2 * RAIL) * 3}
          height={(H + 2 * RAIL) * 3}
          aria-label={t(
            "Аерохокей: веди биту мишкою, пальцем, стрілками або WASD і забий шайбу у ворота вгорі",
            "Air hockey: move your mallet with the mouse, a finger, the arrows or WASD and score in the goal at the top",
          )}
        />
      </ArcadeScreen>
    </div>
  );
}
