"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  CELL,
  CH,
  CW,
  DX,
  DY,
  Dir,
  FIRST_STEPS,
  STARTS,
  TICK_MS,
  WIN_AT,
  cablesRules,
  opposite,
} from "@/lib/live/cables";
import { tr, uiNow, useTr } from "@/lib/i18n";
import { Match, playersOf, seatOf } from "@/lib/live/duel";
import { GameLink, devLag } from "@/lib/live/gameLink";
import { Netplay } from "@/lib/live/netplay";
import { sfx } from "@/lib/live/sfx";
import { supabase } from "@/lib/supabaseClient";
import { shade } from "../cafe/pixel";
import { ArcadeHud, ArcadeSay, ArcadeScreen, Final, lineSay } from "./Arcade";
import { Ctx, Cues, INK, Jolt, MINE, Screen, Sparks, THEIRS, THIRD, bump, countdown, glow, pop } from "./fx";

const W = CW * CELL;
const H = CH * CELL;
const QUIET_MS = 1500;
const SWIPE_PX = 14;
const FANFARE_MS = 500;
const FIRE = ["#ff8a5b", "#ffd25a", "#fff4c9", "#ff5d5d"];
const CONFETTI = ["#ffd25a", "#8fb3ff", "#ff7aa8", "#7ef0c2", "#ffffff", "#c9a6ff"];
const KEYS: Record<string, Dir> = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 };

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
  color: string;
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
  /** every piece laid this round, to lay again at a new scale */
  private laid: { x0: number; y0: number; x1: number; y1: number; color: string }[] = [];
  /** where the cables come out of the wall this round */
  private outlets: { x: number; y: number; color: string }[] = [];
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
    for (const o of this.outlets) this.outlet(o.x, o.y, o.color);
    for (const p of this.laid) this.piece(p.x0, p.y0, p.x1, p.y1, p.color);
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

  private piece(x0: number, y0: number, x1: number, y1: number, color: string) {
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

  private outlet(x: number, y: number, color: string) {
    const c = this.ctxOf(this.wire);
    c.fillStyle = INK;
    c.fillRect(mid(x) - 2, mid(y) - 2, 4, 4);
    c.fillStyle = "#d8d2c4";
    c.fillRect(mid(x) - 1.5, mid(y) - 1.5, 3, 3);
    c.fillStyle = color;
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

  /** A new round, or the same one drawn again: the floor swept clean, and the outlets each cable starts from. */
  reset(outlets: readonly { x: number; y: number; color: string }[]) {
    this.laid = [];
    this.burnt = [];
    this.outlets = outlets.slice();
    this.paint();
  }

  /** One more piece of cable, from cell (x0, y0) to its neighbour (x1, y1). */
  lay(x0: number, y0: number, x1: number, y1: number, color: string) {
    this.laid.push({ x0, y0, x1, y1, color });
    this.piece(x0, y0, x1, y1, color);
  }

  /** A plug ran into something at cell (x, y): fire, a scorch mark, the floor shaking. */
  crash(x: number, y: number, color: string, now: number) {
    this.burnt.push(x, y);
    this.scorch(x, y);
    this.sparks.burst(mid(x), mid(y), 40, 0.1, [...FIRE, color], { life: 700, size: 1.2, drag: 0.993 });
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

  /** One frame with every plug; they pulse while the round is on. */
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
      const x = mid(p.x);
      const y = mid(p.y);
      const beat = live && !p.out ? 0.5 + 0.5 * Math.sin(now / 90) : 0;
      if (!p.out) glow(ctx, x, y, 6 + beat * 2, p.color, 0.35 + beat * 0.25);
      ctx.fillStyle = INK;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      ctx.fillStyle = p.out ? shade(p.color, 0.5) : shade(p.color, 1.35);
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
 * Cables for two or three crawl across the café floor, and whoever runs into a wall, a cable or another plug is out of
 * the round. Played as rollback: one's own turn counts a step later, about the time it takes to reach the others,
 * and their turns are guessed as straight on until they arrive. Crashes and rounds count once every screen is sure.
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
  /** why the game stopped: another player left or closed it */
  note: string | null;
  onEnd: (win: boolean) => void;
}) {
  const t = useTr();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mineRef = useRef<HTMLElement>(null);
  const theirsRef = useRef<HTMLElement>(null);
  const thirdRef = useRef<HTMLElement>(null);
  const sayRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const stopRef = useRef(!!note);
  const [result, setResult] = useState<Final | null>(null);
  const [tally, setTally] = useState<number[]>([0, 0, 0]);
  const end = useEffectEvent(onEnd);
  const { id } = match;
  const players = playersOf(match);
  const me = Math.max(0, seatOf(match, self));
  const ids = players.map((p) => p.id).join(" ");
  /** the others in the order the scoreboard shows them */
  const others = players.filter((_, k) => k !== me);
  const names = players.map((p) => p.name).join(" ");

  useEffect(() => {
    stopRef.current = !!note;
  }, [note]);

  useEffect(() => {
    const sb = supabase;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!sb || !canvas || !ctx || !room) return;
    const seats = ids.split(" ");
    const who = names.split(" ");
    const n = seats.length;
    const view = new CablesView(canvas);
    const cues = new Cues();
    const rules = cablesRules(n);
    const link = new GameLink(sb, `relay-game:${room}:${id}`, self, seats, (from, m) => net.receive(from, m), devLag());
    const net = new Netplay(rules, seats, self, link);
    const starts = STARTS[n];
    /** each seat's place on the scoreboard and its colour: this player first in yellow */
    const order = [me, ...seats.map((_, k) => k).filter((k) => k !== me)];
    const colors: string[] = [];
    order.forEach((k, i) => (colors[k] = [MINE, THEIRS, THIRD][i]));
    /** in a game for two the player on the right sees the floor mirrored, so their cable too starts on the left */
    const mirror = n === 2 && me === 1;
    const sx = (x: number) => (mirror ? CW - 1 - x : x);
    const sd = (d: Dir): Dir => (mirror && d % 2 === 1 ? (((d + 2) % 4) as Dir) : d);
    const plugs: Plug[] = seats.map((_, k) => ({ x: 0, y: 0, d: 1, color: colors[k], out: false }));
    const want: Dir[] = [];
    let mine: Dir = starts[me].d;
    let drawnRound = 0;
    const drawn: number[] = seats.map(() => 0);
    const tip: number[] = seats.map(() => -1);
    let shownRound = 0;
    let shownCrash = 0;
    let shownWon: number | null = null;
    let began = false;
    let over = false;
    let quiet = false;
    let lineAt = 0;
    let raf = 0;
    let from: { x: number; y: number } | null = null;

    const say = (s: string) => {
      if (sayRef.current) sayRef.current.textContent = s;
    };
    const sayT = (uk: string, en: string) => say(tr(uiNow(), uk, en));
    sayT("чекаю на суперника…", "waiting for the other player…");

    /** Lays the cable the game has that this screen hasn't drawn yet; after a step was played again, all of it anew. */
    const sync = () => {
      const s = net.game.state;
      const fresh =
        s.round !== drawnRound ||
        s.trail.some((tr, k) => tr.length < drawn[k] || (drawn[k] && tr[drawn[k] - 1] !== tip[k]));
      if (fresh) {
        drawnRound = s.round;
        view.reset(starts.map((c, k) => ({ x: sx(c.x), y: c.y, color: colors[k] })));
        drawn.fill(0);
        tip.fill(-1);
      }
      s.trail.forEach((tr, k) => {
        for (let i = Math.max(1, drawn[k]); i < tr.length; i++) {
          const a = tr[i - 1];
          const b = tr[i];
          view.lay(sx(a % CW), Math.floor(a / CW), sx(b % CW), Math.floor(b / CW), colors[k]);
        }
        drawn[k] = tr.length;
        tip[k] = tr[tr.length - 1];
      });
      s.head.forEach((c, k) => {
        plugs[k].x = sx(c.x);
        plugs[k].y = c.y;
        plugs[k].d = sd(s.dir[k]);
        plugs[k].out = !s.alive[k];
      });
    };

    /** the crashes, rounds and the end, from the game every screen is sure of */
    const settle = (now: number) => {
      const s = net.game.sure;
      if (s.round !== shownRound) {
        shownRound = s.round;
        shownCrash = 0;
        shownWon = null;
        if (s.round > 1) {
          say("");
          pop(
            popRef.current,
            tr(uiNow(), `РАУНД ${s.round}`, `ROUND ${s.round}`),
            "#ffffff",
            (s.go - s.n) * TICK_MS + 250,
          );
          cues.at(now + (s.go - s.n) * TICK_MS, () => sfx("go"));
        }
      }
      for (; shownCrash < s.crash.length; shownCrash++) {
        const c = s.crash[shownCrash];
        view.crash(sx(c.x), c.y, colors[c.seat], now);
      }
      if (s.won !== null && shownWon === null) {
        shownWon = s.won;
        setTally(order.map((k) => s.score[k]));
        if (s.won >= 0) {
          const ours = s.won === me;
          const at = order.indexOf(s.won);
          bump([mineRef, theirsRef, thirdRef][at].current);
          pop(popRef.current, tr(uiNow(), "БАХ!", "ZAP!"), colors[s.won], 900);
          sfx(ours ? "goal" : "conceded");
          if (ours) sayT("раунд твій", "your round");
          else sayT(`раунд: ${who[s.won]}`, `${who[s.won]} takes the round`);
        } else {
          pop(popRef.current, tr(uiNow(), "НІЧИЯ", "DRAW"), "#ffffff", 900);
          sfx("wall");
          sayT("нічия, ще раз", "draw, again");
        }
      }
      if (s.over && !over) {
        over = true;
        const win = s.score[me] >= WIN_AT;
        const best = Math.max(...s.score.filter((_, k) => k !== me));
        setResult({ win, mine: s.score[me], theirs: best });
        end(win);
        cues.at(now + FANFARE_MS, () => {
          view.end(win);
          sfx(win ? "win" : "lose");
        });
      }
    };

    /** this player's way for the step after next: the first turn asked for that the cable can take */
    const input = (): Dir => {
      const s = net.game.state;
      if (s.won !== null || s.n + 1 < s.go) {
        mine = starts[me].d;
        if (s.won !== null) want.length = 0;
        return mine;
      }
      while (want.length) {
        const w = want.shift()!;
        if (w !== mine && !opposite(mine, w)) {
          mine = w;
          break;
        }
      }
      return mine;
    };

    const turn = (d: Dir) => {
      if (over || want.length >= 3) return;
      want.push(sd(d));
      if (net.started) sfx("steer");
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
        net.run(now, input);
        if (net.started && !began) {
          began = true;
          countdown(cues, () => popRef.current, now, now + FIRST_STEPS * TICK_MS);
          sayT(
            mirror || me === 0 ? "твій кабель жовтий, ліворуч" : "твій кабель жовтий",
            mirror || me === 0 ? "your cable is the yellow one, on the left" : "your cable is the yellow one",
          );
        }
        const stuck = !!net.stalledSince && now - net.stalledSince > QUIET_MS;
        if (stuck !== quiet) {
          quiet = stuck;
          if (stuck) sayT("суперник не відповідає…", "the other player is not answering…");
          else say("");
        }
        settle(now);
      }
      if (now - lineAt > 1000 && lineRef.current && net.started) {
        lineAt = now;
        lineRef.current.textContent = lineSay(link);
      }
      sync();
      const s = net.game.state;
      view.frame(ctx, now, plugs, s.won === null && s.n >= s.go);
      raf = requestAnimationFrame(loop);
    };
    sync();
    view.frame(ctx, performance.now(), plugs, false);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", press);
      canvas.removeEventListener("pointermove", drag);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("keydown", down);
      view.dispose();
      link.close();
    };
  }, [id, ids, me, names, room, self]);

  const verdict =
    result === null
      ? null
      : result.win
        ? t("перемога твоя!", "you win!")
        : t("перемога не твоя цього разу", "not your win this time");
  const rivals = others.map((p) => p.name).join(t(" і ", " and "));
  return (
    <div className="pong">
      <ArcadeHud
        rival={others[0].name}
        winAt={WIN_AT}
        mine={tally[0]}
        theirs={tally[1]}
        mineRef={mineRef}
        theirsRef={theirsRef}
        third={others[1] && { name: others[1].name, score: tally[2] }}
        thirdRef={thirdRef}
      />
      <ArcadeSay>{verdict ?? note ?? <span ref={sayRef} />}</ArcadeSay>
      <ArcadeScreen popRef={popRef} final={result} rival={rivals} lineRef={lineRef}>
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
