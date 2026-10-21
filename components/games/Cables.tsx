"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  CELL,
  CH,
  CW,
  CablesMsg,
  DELAY,
  Dir,
  Field,
  SENT,
  SIDES,
  START,
  TICK_MS,
  WIN_AT,
  cleanCables,
  newField,
  opposite,
  step,
} from "@/lib/live/cables";
import { tr, uiNow, useTr } from "@/lib/i18n";
import { Match, Side, sideOf } from "@/lib/live/duel";
import { sfx } from "@/lib/live/sfx";
import { supabase } from "@/lib/supabaseClient";
import { shade } from "../cafe/pixel";
import { ArcadeHud, ArcadeSay, ArcadeScreen, Final } from "./Arcade";
import { Ctx, Cues, INK, Jolt, MINE, Screen, Sparks, THEIRS, bump, countdown, glow, pop } from "./fx";

const W = CW * CELL;
const H = CH * CELL;
const FIRST_MS = 1500;
const SHOW_CRASH_MS = 1200;
const NEXT_MS = 600;
const QUIET_MS = 2500;
const RESEND_MS = 400;
const HELLO_MS = 1000;
const SWIPE_PX = 14;
const FANFARE_MS = 500;
const FIRE = ["#ff8a5b", "#ffd25a", "#fff4c9", "#ff5d5d"];
const CONFETTI = ["#ffd25a", "#8fb3ff", "#ff7aa8", "#7ef0c2", "#ffffff", "#c9a6ff"];
const KEYS: Record<string, Dir> = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 };
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** The café's floor at night: dark tiles with a faint grid every five cells and a frame. */
function drawFloor(ctx: Ctx) {
  const floor = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.6);
  floor.addColorStop(0, "#1a1e31");
  floor.addColorStop(1, "#0c0e17");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1d2236";
  for (let x = 10; x < W; x += 10) ctx.fillRect(x - 0.25, 0, 0.5, H);
  for (let y = 10; y < H; y += 10) ctx.fillRect(0, y - 0.25, W, 0.5);
  ctx.fillStyle = "#2b3352";
  for (let x = 10; x < W; x += 10) for (let y = 10; y < H; y += 10) ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
  ctx.fillStyle = "#343c5e";
  ctx.fillRect(0, 0, W, 0.5);
  ctx.fillRect(0, H - 0.5, W, 0.5);
  ctx.fillRect(0, 0, 0.5, H);
  ctx.fillRect(W - 0.5, 0, 0.5, H);
}

/** where a cell's middle is, in units */
const mid = (c: number) => c * CELL + CELL / 2;

export interface Plug {
  /** cell, as this viewer sees the floor */
  x: number;
  y: number;
  d: Dir;
  mine: boolean;
  out: boolean;
}

/**
 * What the floor looks like, apart from the game's rules: drawn the way this viewer sees it, their cable starting on
 * the left. The cables are laid piece by piece onto two layers, a soft glow under a bright wire, kept until the round
 * ends; the plugs, sparks and shake are drawn fresh every frame.
 */
export class CablesView {
  readonly screen: Screen;
  private bg!: HTMLCanvasElement;
  private under!: HTMLCanvasElement;
  private wire!: HTMLCanvasElement;
  /** every piece laid this round, x0 y0 x1 y1 mine, to lay again at a new scale */
  private laid: number[] = [];
  /** where the two cables come out of the wall this round: x y mine */
  private outlets: number[] = [];
  private burnt: number[] = [];
  private readonly sparks = new Sparks();
  private readonly jolt = new Jolt();
  private prev = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.screen = new Screen(canvas, W, H);
    this.paint();
  }

  private paint() {
    const s = this.screen;
    this.bg = s.layer(drawFloor);
    this.under = s.layer(() => {});
    this.wire = s.layer(() => {});
    for (let i = 0; i < this.outlets.length; i += 3) this.outlet(this.outlets[i], this.outlets[i + 1], this.outlets[i + 2] === 1);
    for (let i = 0; i < this.laid.length; i += 5) {
      const [x0, y0, x1, y1, m] = this.laid.slice(i, i + 5);
      this.piece(x0, y0, x1, y1, m === 1);
    }
    for (let i = 0; i < this.burnt.length; i += 2) this.scorch(this.burnt[i], this.burnt[i + 1]);
  }

  private ctxOf(layer: HTMLCanvasElement): Ctx {
    const ctx = layer.getContext("2d")!;
    this.screen.begin(ctx);
    return ctx;
  }

  /**
   * A piece from one cell's middle to the next, `r` units thick each side, running on past the far end by `r` but
   * not back over the near one, so it joins the piece before without covering its bright core.
   */
  private band(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number) {
    const ax = mid(x0);
    const ay = mid(y0);
    const bx = mid(x1) + Math.sign(x1 - x0) * r;
    const by = mid(y1) + Math.sign(y1 - y0) * r;
    if (y0 === y1) ctx.fillRect(Math.min(ax, bx), ay - r, Math.abs(bx - ax), 2 * r);
    else ctx.fillRect(ax - r, Math.min(ay, by), 2 * r, Math.abs(by - ay));
  }

  private piece(x0: number, y0: number, x1: number, y1: number, mine: boolean) {
    const color = mine ? MINE : THEIRS;
    const u = this.ctxOf(this.under);
    u.fillStyle = color;
    this.band(u, x0, y0, x1, y1, 1.8);
    const c = this.ctxOf(this.wire);
    c.fillStyle = INK;
    this.band(c, x0, y0, x1, y1, 0.9);
    c.fillStyle = shade(color, 0.8);
    this.band(c, x0, y0, x1, y1, 0.6);
    c.fillStyle = shade(color, 1.3);
    this.band(c, x0, y0, x1, y1, 0.2);
  }

  private outlet(x: number, y: number, mine: boolean) {
    const c = this.ctxOf(this.wire);
    c.fillStyle = INK;
    c.fillRect(mid(x) - 2, mid(y) - 2, 4, 4);
    c.fillStyle = "#d8d2c4";
    c.fillRect(mid(x) - 1.5, mid(y) - 1.5, 3, 3);
    c.fillStyle = mine ? MINE : THEIRS;
    c.fillRect(mid(x) - 1.5, mid(y) + 1, 3, 0.5);
    c.fillStyle = "#4a4458";
    c.fillRect(mid(x) - 1, mid(y) - 0.5, 0.5, 1);
    c.fillRect(mid(x) + 0.5, mid(y) - 0.5, 0.5, 1);
  }

  private scorch(x: number, y: number) {
    const c = this.ctxOf(this.wire);
    c.fillStyle = "#2a1410";
    c.fillRect(mid(x) - 1.5, mid(y) - 1.5, 3, 3);
    c.fillStyle = "#ff8a5b";
    c.fillRect(mid(x) - 0.5, mid(y) - 0.5, 1, 1);
  }

  /** A new round: the floor swept clean, and the outlets each cable starts from. */
  reset(outlets: readonly { x: number; y: number; mine: boolean }[]) {
    this.laid = [];
    this.burnt = [];
    this.outlets = outlets.flatMap((o) => [o.x, o.y, o.mine ? 1 : 0]);
    this.paint();
  }

  /** One more piece of cable, from cell (x0, y0) to its neighbour (x1, y1). */
  lay(x0: number, y0: number, x1: number, y1: number, mine: boolean) {
    this.laid.push(x0, y0, x1, y1, mine ? 1 : 0);
    this.piece(x0, y0, x1, y1, mine);
  }

  /** A plug ran into something at cell (x, y): fire, a scorch mark, the floor shaking. */
  crash(x: number, y: number, mine: boolean, now: number) {
    this.burnt.push(x, y);
    this.scorch(x, y);
    this.sparks.burst(mid(x), mid(y), 40, 0.1, [...FIRE, mine ? MINE : THEIRS], { life: 700, size: 1.2, drag: 0.993 });
    this.jolt.shake(2.2, 380, now);
    this.jolt.flash("#ff8a5b", 0.2, 260, now);
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

  /** One frame with both plugs; they pulse while the round is on. */
  frame(ctx: Ctx, now: number, plugs: readonly Plug[], live: boolean) {
    const s = this.screen;
    if (s.takeResize()) this.paint();
    const dt = this.prev ? Math.min(100, now - this.prev) : 16;
    this.prev = now;
    this.sparks.step(dt);
    this.jolt.update(now);
    const { dx, dy } = this.jolt;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
    s.blit(ctx, this.bg, dx, dy);
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.16;
    s.blit(ctx, this.under, dx, dy);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = op;
    s.blit(ctx, this.wire, dx, dy);
    s.begin(ctx, dx, dy);

    for (const p of plugs) {
      const color = p.mine ? MINE : THEIRS;
      const x = mid(p.x);
      const y = mid(p.y);
      const beat = live && !p.out ? 0.5 + 0.5 * Math.sin(now / 90) : 0;
      if (!p.out) glow(ctx, x, y, 6 + beat * 2, color, 0.35 + beat * 0.25);
      ctx.fillStyle = INK;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      ctx.fillStyle = p.out ? shade(color, 0.5) : shade(color, 1.35);
      ctx.fillRect(x - 1, y - 1, 2, 2);
      if (p.out) continue;
      const fx = x + DX[p.d] * 1.5;
      const fy = y + DY[p.d] * 1.5;
      ctx.fillStyle = "#e9f2ea";
      if (DX[p.d]) {
        ctx.fillRect(fx - 0.25, fy - 1, 0.5, 0.5);
        ctx.fillRect(fx - 0.25, fy + 0.5, 0.5, 0.5);
      } else {
        ctx.fillRect(fx - 1, fy - 0.25, 0.5, 0.5);
        ctx.fillRect(fx + 0.5, fy - 0.25, 0.5, 0.5);
      }
    }
    this.sparks.draw(ctx, s);
    this.jolt.overlay(ctx, 0, 0, W, H, now);
  }

  dispose() {
    this.screen.dispose();
  }
}

/**
 * Two cables crawl across the café floor and whoever runs into a wall or a cable loses the round. Lockstep over the
 * match's own channel: a turn counts DELAY steps after it is made, and a step runs only once both turns for it are
 * known, so both screens play exactly the same game.
 */
export default function Cables({
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
    const view = new CablesView(canvas);
    const cues = new Cues();
    const rival: Side = me === "x" ? "o" : "x";
    const plugs: Plug[] = [me, rival].map((s) => ({ x: 0, y: 0, d: 1 as Dir, mine: s === me, out: false }));
    const score: Record<Side, number> = { x: 0, o: 0 };
    const turns: Record<Side, Map<number, Dir>> = { x: new Map(), o: new Map() };
    const want: Dir[] = [];
    let field: Field = newField();
    let round = 0;
    let n = 0;
    let nextAt = 0;
    let restartAt = 0;
    let playing = false;
    let met = false;
    let over = false;
    let waitSince = 0;
    let quiet = false;
    let sentAt = 0;
    let helloAt = 0;
    let last: CablesMsg | null = null;
    let from: { x: number; y: number } | null = null;
    let raf = 0;

    const at = (r: number, t: number) => r * 100000 + t;
    const sx = (x: number) => (me === "x" ? x : CW - 1 - x);
    const ch = sb.channel(`relay-cables:${room}:${id}`, { config: { broadcast: { self: false } } });
    const send = (m: CablesMsg) => ch.send({ type: "broadcast", event: "c", payload: m });
    const say = (s: string) => {
      if (sayRef.current) sayRef.current.textContent = s;
    };
    const sayT = (uk: string, en: string) => say(tr(uiNow(), uk, en));
    const hud = () => setTally([score[me], score[rival]]);
    /** what a turn looks like on this screen: the floor is mirrored for the player on the right */
    const sd = (d: Dir): Dir => (me === "o" && d % 2 === 1 ? (((d + 2) % 4) as Dir) : d);

    const draw = (now: number) => {
      [me, rival].forEach((s, i) => {
        const p = plugs[i];
        p.x = sx(field.head[s].x);
        p.y = field.head[s].y;
        p.d = sd(field.dir[s]);
      });
      view.frame(ctx, now, plugs, playing);
    };

    const begin = (now: number, wait: number) => {
      round += 1;
      n = 0;
      field = newField();
      want.length = 0;
      for (const s of SIDES) {
        for (const k of turns[s].keys()) if (k < at(round, 0)) turns[s].delete(k);
        for (let t = 1; t <= DELAY; t++) turns[s].set(at(round, t), START[s].d);
      }
      playing = true;
      nextAt = now + wait;
      view.reset(SIDES.map((s) => ({ x: sx(START[s].x), y: START[s].y, mine: s === me })));
      for (const p of plugs) p.out = false;
      if (round === 1) countdown(cues, () => popRef.current, now, nextAt);
      else {
        pop(popRef.current, tr(uiNow(), `РАУНД ${round}`, `ROUND ${round}`), "#ffffff", wait + 250);
        cues.at(nextAt, () => sfx("go"));
      }
    };

    const roundOver = (crashed: Side[], now: number) => {
      playing = false;
      crashed.forEach((s, i) => {
        plugs[s === me ? 0 : 1].out = true;
        view.crash(sx(field.crash[i].x), field.crash[i].y, s === me, now);
      });
      if (crashed.length === 1) {
        const winner: Side = crashed[0] === "x" ? "o" : "x";
        score[winner] += 1;
        hud();
        const ours = winner === me;
        bump(ours ? mineRef.current : theirsRef.current);
        pop(popRef.current, tr(uiNow(), "БАХ!", "ZAP!"), ours ? THEIRS : MINE, 900);
        sfx(ours ? "goal" : "conceded");
        if (ours) sayT("раунд твій", "your round");
        else sayT("раунд суперника", "their round");
      } else {
        pop(popRef.current, tr(uiNow(), "НІЧИЯ", "DRAW"), "#ffffff", 900);
        sfx("wall");
        sayT("нічия, ще раз", "draw, again");
      }
      if (Math.max(score.x, score.o) >= WIN_AT) {
        over = true;
        const win = score[me] >= WIN_AT;
        setResult({ win, mine: score[me], theirs: score[rival] });
        end(win);
        cues.at(now + FANFARE_MS, () => {
          view.end(win);
          sfx(win ? "win" : "lose");
        });
      } else restartAt = now + SHOW_CRASH_MS;
    };

    const advance = (now: number) => {
      const t = n + 1;
      const theirs = turns[rival].get(at(round, t));
      const mine = turns[me].get(at(round, t));
      if (theirs === undefined || mine === undefined) {
        if (!waitSince) waitSince = now;
        return false;
      }
      let d = turns[me].get(at(round, t + DELAY - 1)) ?? mine;
      while (want.length) {
        const w = want.shift()!;
        if (w !== d && !opposite(d, w)) {
          d = w;
          break;
        }
      }
      turns[me].set(at(round, t + DELAY), d);
      const ds: Dir[] = [];
      for (let k = t + DELAY; ds.length < SENT && turns[me].has(at(round, k)); k--) {
        ds.unshift(turns[me].get(at(round, k))!);
      }
      last = { t: "in", r: round, n: t + DELAY, d: ds };
      send(last);
      sentAt = now;
      waitSince = 0;
      if (quiet) {
        quiet = false;
        say("");
      }
      const was = { x: { ...field.head.x }, o: { ...field.head.o } };
      const crashed = step(field, { [me]: mine, [rival]: theirs } as Record<Side, Dir>);
      for (const s of SIDES) {
        if (!crashed.includes(s)) view.lay(sx(was[s].x), was[s].y, sx(field.head[s].x), field.head[s].y, s === me);
      }
      n = t;
      if (crashed.length) roundOver(crashed, now);
      return true;
    };

    ch.on("broadcast", { event: "c" }, ({ payload }) => {
      const m = cleanCables(payload);
      if (!m || over) return;
      if (!met) {
        met = true;
        send({ t: "hello" });
        begin(performance.now(), FIRST_MS);
        sayT("твій кабель жовтий, ліворуч", "your cable is the yellow one, on the left");
      }
      if (m.t === "hello" || m.r < round) return;
      m.d.forEach((d, i) => {
        const k = at(m.r, m.n - m.d.length + 1 + i);
        if (!turns[rival].has(k)) turns[rival].set(k, d);
      });
    });
    ch.subscribe((s) => {
      if (s !== "SUBSCRIBED") return;
      send({ t: "hello" });
      helloAt = performance.now();
      sayT("чекаю на суперника…", "waiting for the other player…");
    });

    const turn = (d: Dir) => {
      if (over || want.length >= 3) return;
      want.push(sd(d));
      if (playing) sfx("steer");
    };
    const down = (e: KeyboardEvent) => {
      const d = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (d === undefined || typing || over) return;
      e.preventDefault();
      if (!e.repeat) turn(d);
    };
    const press = (e: PointerEvent) => {
      from = { x: e.clientX, y: e.clientY };
    };
    const drag = (e: PointerEvent) => {
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
      from = { x: e.clientX, y: e.clientY };
    };
    const release = () => {
      from = null;
    };
    canvas.addEventListener("pointerdown", press);
    canvas.addEventListener("pointermove", drag);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("keydown", down);

    const loop = () => {
      const now = performance.now();
      if (stopRef.current) cues.clear();
      cues.run(now);
      if (!stopRef.current && !over) {
        if (!met && helloAt && now - helloAt > HELLO_MS) {
          send({ t: "hello" });
          helloAt = now;
        }
        if (restartAt && now >= restartAt) {
          restartAt = 0;
          say("");
          begin(now, NEXT_MS);
        }
        for (let i = 0; playing && i < 3 && now >= nextAt; i++) {
          if (!advance(now)) break;
          nextAt = Math.max(nextAt + TICK_MS, now - TICK_MS);
        }
        if (playing && waitSince) {
          if (last && now - sentAt > RESEND_MS) {
            send(last);
            sentAt = now;
          }
          if (!quiet && now - waitSince > QUIET_MS) {
            quiet = true;
            sayT("суперник не відповідає…", "the other player is not answering…");
          }
        }
      }
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    draw(performance.now());
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", press);
      canvas.removeEventListener("pointermove", drag);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("keydown", down);
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
            "Кабелі: повертай стрілками, WASD або проведи пальцем; не врізайся у стіни й кабелі",
            "Cables: turn with the arrows, WASD or a swipe; don't hit the walls or the cables",
          )}
        />
      </ArcadeScreen>
    </div>
  );
}
