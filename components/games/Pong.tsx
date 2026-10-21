"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { tr, uiNow, useTr } from "@/lib/i18n";
import { Match, Side, sideOf } from "@/lib/live/duel";
import {
  Ball,
  FACE,
  GAP,
  H,
  PAD_H,
  PAD_W,
  PongMsg,
  R,
  W,
  WIN_AT,
  atFace,
  bounce,
  clampPad,
  cleanPong,
  covers,
  fly,
  flyFor,
  gone,
  heading,
  reflect,
  serve,
} from "@/lib/live/pong";
import { sfx } from "@/lib/live/sfx";
import { supabase } from "@/lib/supabaseClient";
import { rgba } from "../cafe/pixel";
import { ArcadeHud, ArcadeSay, ArcadeScreen, Final } from "./Arcade";
import { Ctx, Cues, INK, Jolt, MINE, Screen, Sparks, THEIRS, Trail, bump, countdown, digits, digitsW, glow, pop } from "./fx";

const STEP_MS = 8;
const PAD_EVERY_MS = 60;
const PING_EVERY_MS = 3000;
const FIRST_SERVE_MS = 1500;
const NEXT_SERVE_MS = 1000;
const QUIET_MS = 2500;
const BALL = "#f6f1e4";
/** a paddle stays lit this long after it hits */
const FLASH_MS = 160;
const CLICK_MS = 60;
const FANFARE_MS = 600;
const CONFETTI = ["#ffd25a", "#8fb3ff", "#ff7aa8", "#7ef0c2", "#ffffff", "#c9a6ff"];

/** The table: dark green with a glow in the middle, white edges, a faint centre line and the net lit up. */
function drawTable(ctx: Ctx, k: number) {
  const felt = ctx.createRadialGradient(W / 2, H / 2, 6, W / 2, H / 2, W * 0.62);
  felt.addColorStop(0, "#1b5446");
  felt.addColorStop(1, "#081d18");
  ctx.fillStyle = felt;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1f5045";
  for (let x = 2; x < W - 2; x += 4) ctx.fillRect(x, H / 2 - 0.25, 2, 0.5);
  ctx.save();
  ctx.shadowColor = "#d8fff2";
  ctx.shadowBlur = 2 * k;
  ctx.fillStyle = "#e9f2ea";
  ctx.fillRect(0, 0, W, 1);
  ctx.fillRect(0, H - 1, W, 1);
  ctx.shadowColor = "#9ff5d9";
  ctx.shadowBlur = 3 * k;
  ctx.fillStyle = "#c8f5e6";
  for (let y = 3; y < H - 3; y += 6) ctx.fillRect(W / 2 - 0.5, y, 1, 3);
  ctx.restore();
}

function drawPad(ctx: Ctx, s: Screen, x: number, y: number, color: string, lit: number, inner: 1 | -1) {
  const top = s.snap(y - PAD_H / 2);
  glow(ctx, x + PAD_W / 2, y, PAD_H * 0.75, color, 0.22 + lit * 0.4);
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, top - 1, PAD_W + 2, PAD_H + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x, top, PAD_W, PAD_H);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(inner > 0 ? x + PAD_W - 1 : x, top, 1, PAD_H);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(inner > 0 ? x : x + PAD_W - 1, top, 1, PAD_H);
  if (lit > 0) {
    ctx.globalAlpha = lit;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, top, PAD_W, PAD_H);
    ctx.globalAlpha = 1;
  }
}

interface Moving {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * What the table looks like, apart from the game's rules: drawn the way this viewer sees it, their paddle on the left.
 * It notices hits and bounces by the ball's sudden turns, so the other side's hits show the same as one's own.
 */
export class PongView {
  readonly screen: Screen;
  private bg!: HTMLCanvasElement;
  private readonly sparks = new Sparks();
  private readonly trail = new Trail(10);
  private readonly jolt = new Jolt();
  private lit = { mine: 0, theirs: 0 };
  private had = false;
  private pvx = 0;
  private pvy = 0;
  private hitAt = 0;
  private wallAt = 0;
  private prev = 0;
  private tally = ["0", "0"];

  constructor(canvas: HTMLCanvasElement) {
    this.screen = new Screen(canvas, W, H);
    this.paint();
  }

  private paint() {
    this.bg = this.screen.layer((ctx) => drawTable(ctx, this.screen.k));
  }

  /** The score drawn big and dim on each half of the table, the old arcade way. */
  score(mine: number, theirs: number) {
    this.tally = [String(mine), String(theirs)];
  }

  /** A point: sparks where the ball went out, the table shaking, a flash in the scorer's colour. */
  point(mine: boolean, y: number, now: number) {
    const color = mine ? MINE : THEIRS;
    this.sparks.burst(mine ? W : 0, y, 36, 0.12, [color, "#ffffff"], {
      dir: mine ? Math.PI : 0,
      spread: 2.4,
      life: 650,
      size: 1.2,
    });
    this.jolt.shake(2, 360, now);
    this.jolt.flash(color, 0.22, 300, now);
    this.trail.clear();
  }

  /** The match is over: confetti for the winner. */
  end(win: boolean) {
    if (!win) return;
    for (const x of [W * 0.2, W / 2, W * 0.8]) {
      this.sparks.burst(x, -2, 55, 0.08, CONFETTI, {
        dir: Math.PI / 2,
        spread: 2.4,
        life: 2800,
        size: 1.5,
        fall: 0.00006,
        drag: 0.997,
      });
    }
  }

  private watch(b: Moving | null, now: number) {
    if (!b) {
      this.had = false;
      this.trail.clear();
      return;
    }
    if (this.had && Math.sign(b.vx) !== Math.sign(this.pvx) && this.pvx !== 0) {
      const left = b.x < W / 2;
      const color = left ? MINE : THEIRS;
      const fx = left ? FACE.x : W - FACE.x;
      if (left) this.lit.mine = now + FLASH_MS;
      else this.lit.theirs = now + FLASH_MS;
      const power = Math.min(1, Math.hypot(b.vx, b.vy) / 0.17);
      this.sparks.burst(fx, b.y, 6 + Math.round(power * 10), 0.04 + power * 0.07, [color, "#ffffff"], {
        dir: left ? 0 : Math.PI,
        spread: 2,
        life: 300,
      });
      if (now - this.hitAt > CLICK_MS) {
        this.hitAt = now;
        sfx("hit");
      }
    } else if (this.had && Math.sign(b.vy) !== Math.sign(this.pvy) && this.pvy !== 0) {
      this.sparks.burst(b.x, b.y < H / 2 ? 0.5 : H - 0.5, 4, 0.04, ["#d8fff2", "#ffffff"], { life: 200 });
      if (now - this.wallAt > CLICK_MS) {
        this.wallAt = now;
        sfx("wall");
      }
    }
    this.had = true;
    this.pvx = b.vx;
    this.pvy = b.vy;
  }

  /** One frame; the ball, its speed and both paddles' heights as this viewer sees them. */
  frame(ctx: Ctx, now: number, b: Moving | null, mine: number, theirs: number) {
    const s = this.screen;
    if (s.takeResize()) this.paint();
    const dt = this.prev ? Math.min(100, now - this.prev) : 16;
    this.prev = now;
    this.watch(b, now);
    this.sparks.step(dt);
    this.jolt.update(now);
    const { dx, dy } = this.jolt;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
    s.blit(ctx, this.bg, dx, dy);
    s.begin(ctx, dx, dy);
    const [a, z] = this.tally;
    digits(ctx, a, W / 4 - digitsW(a, 3) / 2, 9, 3, rgba(MINE, 0.13));
    digits(ctx, z, (3 * W) / 4 - digitsW(z, 3) / 2, 9, 3, rgba(THEIRS, 0.13));

    drawPad(ctx, s, GAP, mine, MINE, Math.max(0, (this.lit.mine - now) / FLASH_MS), 1);
    drawPad(ctx, s, W - GAP - PAD_W, theirs, THEIRS, Math.max(0, (this.lit.theirs - now) / FLASH_MS), -1);
    if (b) {
      this.trail.push(b.x, b.y);
      this.trail.draw(ctx, s, "#fff3c8", 2.6, Math.min(0.55, Math.hypot(b.vx, b.vy) * 4));
      glow(ctx, b.x, b.y, 7, "#ffffff", 0.3);
      const L = s.snap(b.x - R);
      const T = s.snap(b.y - R);
      ctx.fillStyle = BALL;
      ctx.fillRect(L, T, 3, 3);
      ctx.fillStyle = "#c9bfa8";
      ctx.fillRect(L + 2, T + 1, 1, 2);
      ctx.fillRect(L + 1, T + 2, 1, 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(L, T, 1, 1);
    }
    this.sparks.draw(ctx, s);
    this.jolt.overlay(ctx, 0, 0, W, H, now);
  }

  dispose() {
    this.screen.dispose();
  }
}

/**
 * Ping-pong over a channel of the match's own. Each player rules on the ball at their own paddle — the hit or the
 * miss they saw — and tells the other; between those words both fly the same ball, a half round trip apart.
 */
export default function Pong({
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
  const stopRef = useRef(!!note);
  const [result, setResult] = useState<Final | null>(null);
  const [tally, setTally] = useState<[number, number]>([0, 0]);
  const end = useEffectEvent(onEnd);
  const { id } = match;
  const me: Side = sideOf(match, self) ?? "o";

  useEffect(() => {
    stopRef.current = !!note;
  }, [note]);

  useEffect(() => {
    const sb = supabase;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!sb || !canvas || !ctx || !room) return;
    const view = new PongView(canvas);
    const cues = new Cues();
    const rival: Side = me === "x" ? "o" : "x";
    const pads: Record<Side, number> = { x: H / 2, o: H / 2 };
    const score: Record<Side, number> = { x: 0, o: 0 };
    const seen: Record<Side, number> = { x: 0, o: 0 };
    const keys = new Set<string>();
    const seenBall = { x: 0, y: 0, vx: 0, vy: 0 };
    let lastY = H / 2;
    let shown = H / 2;
    let ball: Ball | null = null;
    let dead = false;
    let pending = false;
    let n = 0;
    let rtt = 120;
    let met = false;
    let over = false;
    let serveAt = 0;
    let sentPad = { at: 0, y: -1 };
    let pingAt = 0;
    let quietSince = 0;
    let raf = 0;
    let prev = 0;

    const ch = sb.channel(`relay-pong:${room}:${id}`, { config: { broadcast: { self: false } } });
    const send = (m: PongMsg) => ch.send({ type: "broadcast", event: "p", payload: m });
    const say = (s: string) => {
      if (sayRef.current) sayRef.current.textContent = s;
    };
    const sayT = (uk: string, en: string) => say(tr(uiNow(), uk, en));
    const hud = () => {
      setTally([score[me], score[rival]]);
      view.score(score[me], score[rival]);
      const now = performance.now();
      for (const s of [me, rival]) {
        if (score[s] <= seen[s]) continue;
        seen[s] = score[s];
        const ours = s === me;
        view.point(ours, lastY, now);
        bump(ours ? mineRef.current : theirsRef.current);
        pop(popRef.current, tr(uiNow(), "ОЧКО!", "POINT!"), ours ? MINE : THEIRS, 800);
        sfx(ours ? "goal" : "conceded");
      }
    };
    const finish = () => {
      if (over || Math.max(score.x, score.o) < WIN_AT) return false;
      over = true;
      serveAt = 0;
      const win = score[me] >= WIN_AT;
      setResult({ win, mine: score[me], theirs: score[rival] });
      end(win);
      cues.at(performance.now() + FANFARE_MS, () => {
        view.end(win);
        sfx(win ? "win" : "lose");
      });
      return true;
    };

    ch.on("broadcast", { event: "p" }, ({ payload }) => {
      const m = cleanPong(payload);
      if (!m || over) return;
      const now = performance.now();
      if (m.t === "hello") {
        if (met) return;
        met = true;
        send({ t: "hello" });
        countdown(cues, () => popRef.current, now, now + FIRST_SERVE_MS);
        if (me === "x") {
          serveAt = now + FIRST_SERVE_MS;
          sayT("подаєш ти", "your serve");
        } else sayT("готуйся, подає суперник", "get ready, their serve");
      } else if (m.t === "ping") send({ t: "pong", a: m.a });
      else if (m.t === "pong") rtt = Math.min(600, Math.max(20, rtt * 0.6 + (now - m.a) * 0.4));
      else if (m.t === "pad") pads[rival] = clampPad(m.y);
      else if (m.n > n) {
        n = m.n;
        pending = false;
        quietSince = 0;
        if (m.t === "ball") {
          ball = flyFor(m.b, rtt / 2);
          dead = false;
          say("");
        } else {
          score.x = m.x;
          score.o = m.o;
          ball = null;
          hud();
          finish();
        }
      }
    });
    ch.subscribe((s) => {
      if (s !== "SUBSCRIBED") return;
      send({ t: "hello" });
      sayT("чекаю на суперника…", "waiting for the other player…");
    });

    const step = (dt: number, now: number) => {
      if (!ball) return;
      if (pending && (gone(ball) || (atFace(ball) && heading(ball) === me))) {
        if (!quietSince) quietSince = now;
        return;
      }
      let b = fly(ball, dt);
      if (!dead && !pending && atFace(b)) {
        const to = heading(b);
        if (to === me && covers(pads[me], b)) {
          b = bounce(b, pads[me]);
          send({ t: "ball", n: ++n, b });
        } else if (to === me) {
          dead = true;
          score[rival] += 1;
          send({ t: "point", n: ++n, x: score.x, o: score.o });
          hud();
          if (!finish()) serveAt = now + NEXT_SERVE_MS;
        } else {
          pending = true;
          if (covers(pads[rival], b)) b = reflect(b);
        }
      }
      ball = dead && gone(b) ? null : b;
    };

    const draw = (now: number) => {
      if (ball) {
        seenBall.x = me === "x" ? ball.x : W - ball.x;
        seenBall.y = lastY = ball.y;
        seenBall.vx = me === "x" ? ball.vx : -ball.vx;
        seenBall.vy = ball.vy;
      }
      view.frame(ctx, now, ball && seenBall, pads[me], shown);
    };

    const point = (e: PointerEvent) => {
      pads[me] = clampPad(view.screen.at(e).y);
    };
    const down = (e: KeyboardEvent) => {
      if (over || !["ArrowUp", "ArrowDown", "w", "s"].includes(e.key)) return;
      keys.add(e.key);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key);
    canvas.addEventListener("pointermove", point);
    canvas.addEventListener("pointerdown", point);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    const loop = () => {
      const now = performance.now();
      const dt = prev ? Math.min(3000, now - prev) : 16;
      prev = now;
      if (stopRef.current) cues.clear();
      cues.run(now);
      if (!stopRef.current && !over) {
        const dir = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
        if (dir) pads[me] = clampPad(pads[me] + dir * dt * 0.14);
        if (serveAt && now >= serveAt) {
          serveAt = 0;
          ball = serve(me);
          dead = false;
          send({ t: "ball", n: ++n, b: ball });
          say("");
        }
        for (let left = dt; left > 0; left -= STEP_MS) step(Math.min(STEP_MS, left), now);
        if (met && now - sentPad.at >= PAD_EVERY_MS && Math.abs(pads[me] - sentPad.y) >= 0.5) {
          sentPad = { at: now, y: pads[me] };
          send({ t: "pad", y: pads[me] });
        }
        if (met && now - pingAt >= PING_EVERY_MS) {
          pingAt = now;
          send({ t: "ping", a: now });
        }
        if (quietSince && now - quietSince > QUIET_MS) {
          sayT("суперник не відповідає…", "the other player is not answering…");
        }
      }
      shown += (pads[rival] - shown) * Math.min(1, dt / 50);
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
      sb.removeChannel(ch);
    };
  }, [id, me, room]);

  const rival = me === "x" ? match.o : match.x;
  const verdict =
    result === null
      ? null
      : result.win
        ? t("перемога твоя!", "you win!")
        : t(`перемога: ${rival.name}`, `${rival.name} wins`);
  return (
    <div className="pong">
      <ArcadeHud
        rival={rival.name}
        winAt={WIN_AT}
        mine={tally[0]}
        theirs={tally[1]}
        mineRef={mineRef}
        theirsRef={theirsRef}
      />
      <ArcadeSay>{verdict ?? note ?? <span ref={sayRef} />}</ArcadeSay>
      <ArcadeScreen popRef={popRef} final={result} rival={rival.name}>
        <canvas
          ref={canvasRef}
          width={W * 3}
          height={H * 3}
          aria-label={t(
            "Пінг-понг: веди ракетку мишкою, пальцем або стрілками вгору й униз",
            "Ping-pong: move your paddle with the mouse, a finger or the up and down arrows",
          )}
        />
      </ArcadeScreen>
    </div>
  );
}
