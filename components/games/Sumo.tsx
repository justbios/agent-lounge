"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { tr, uiNow, useTr } from "@/lib/i18n";
import { Match, playersOf, seatOf } from "@/lib/live/duel";
import { GameLink, devLag } from "@/lib/live/gameLink";
import { Netplay } from "@/lib/live/netplay";
import { sfx } from "@/lib/live/sfx";
import {
  BODY_R,
  C,
  DASH_COOL,
  FIRST_STEPS,
  MELT_AFTER,
  Push,
  STARTS,
  STEP_MS,
  SumoState,
  W,
  WIN_AT,
  pushAt,
  sumoRules,
} from "@/lib/live/sumo";
import { supabase } from "@/lib/supabaseClient";
import { shade } from "../cafe/pixel";
import { ArcadeHud, ArcadeSay, ArcadeScreen, Final, lineSay } from "./Arcade";
import {
  Ctx,
  Cues,
  INK,
  Jolt,
  MINE,
  Screen,
  Sparks,
  THEIRS,
  THIRD,
  bump,
  countdown,
  disc,
  glow,
  pop,
  ring,
} from "./fx";

const QUIET_MS = 1500;
const FANFARE_MS = 500;
/** how long one who fell in takes to sink, ms */
const SINK_MS = 700;
/** a bump sounds at most this often */
const CLICK_MS = 90;
/** a key aims this far ahead of the wrestler */
const KEY_REACH = 30;
/** a quick tap still counts as a dash for this many steps, so the press is never missed between two steps */
const TAP_STEPS = 3;
/** How far a correction still shows, eased off by half every SMOOTH_MS; a jump this big is a new round, not a fix. */
const SMOOTH_MS = 35;
const SNAP = 20;
const SPLASH = ["#ffffff", "#d6eeff", "#7cc0f2", "#3f86c4"];
const ICE = ["#ffffff", "#d6eeff", "#bfe3f5"];
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
const DASH_KEYS = new Set([" ", "Enter", "Shift"]);

/** The sea at night round the floe: deep water with a few still glints, painted once. */
function drawSea(ctx: Ctx) {
  const sea = ctx.createRadialGradient(C, C, 10, C, C, W * 0.75);
  sea.addColorStop(0, "#123a5a");
  sea.addColorStop(1, "#06121f");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, W, W);
  let r = 7;
  const rnd = () => (r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * W);
    ctx.fillStyle = rnd() < 0.3 ? "#2c6d96" : "#1a4b70";
    ctx.fillRect(x, y, 2 + Math.floor(rnd() * 3), 0.5);
  }
}

/** cracks on the floe, as segments from its middle, the same on every screen and every round */
const CRACKS = (() => {
  let r = 3;
  const rnd = () => (r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  return Array.from({ length: 7 }, () => {
    const a = rnd() * Math.PI * 2;
    const from = 14 + rnd() * 20;
    const to = from + 10 + rnd() * 26;
    return { a, from, to };
  });
})();

/** A wrestler: a round puck in their colour, lit from the top left; the eyes are drawn on top each frame. */
function paintBody(ctx: Ctx, color: string) {
  const c = BODY_R + 1.5;
  disc(ctx, c, c, BODY_R + 1, INK);
  disc(ctx, c, c, BODY_R, shade(color, 0.7));
  disc(ctx, c - 0.5, c - 0.5, BODY_R - 1, color);
  disc(ctx, c - 1.5, c - 1.5, BODY_R - 3.5, shade(color, 1.3));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(c - 3, c - 4, 1, 1);
}

export interface Seen {
  x: number;
  y: number;
  /** where they look, a unit vector */
  lx: number;
  ly: number;
  color: string;
  /** 0 standing, up to 1 sunk */
  sink: number;
  me: boolean;
  /** share of the dash ready, for this player's own ring */
  ready: number;
}

/**
 * The floe as this viewer sees it, turned so their own wrestler starts at the bottom. The sea is painted once; the
 * floe is drawn every frame as it melts, with the wrestlers, splashes and sparks over it.
 */
export class SumoView {
  readonly screen: Screen;
  private sea!: HTMLCanvasElement;
  private bodies = new Map<string, HTMLCanvasElement>();
  private readonly sparks = new Sparks();
  private readonly jolt = new Jolt();
  private prev = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly colors: readonly string[],
  ) {
    this.screen = new Screen(canvas, W, W);
    this.paint();
  }

  private paint() {
    const s = this.screen;
    this.sea = s.layer(drawSea);
    this.bodies = new Map(this.colors.map((c) => [c, s.sprite(2 * BODY_R + 3, (ctx) => paintBody(ctx, c))]));
  }

  splash(x: number, y: number, now: number, mine: boolean) {
    this.sparks.burst(x, y, 36, 0.07, SPLASH, { life: 800, size: 1.2, drag: 0.992, fall: 0.00004 });
    if (mine) {
      this.jolt.shake(2, 360, now);
      this.jolt.flash("#7cc0f2", 0.18, 300, now);
    }
  }

  hit(x: number, y: number, power: number, now: number) {
    this.sparks.burst(x, y, Math.round(6 + power * 60), 0.03 + power * 0.25, ICE, { life: 380, size: 1, drag: 0.99 });
    if (power > 0.12) this.jolt.shake(Math.min(2.2, power * 9), 200, now);
  }

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

  /** One frame: the floe at radius `r`, `aim` this player's pointer or null. */
  frame(ctx: Ctx, now: number, r: number, bodies: readonly Seen[], aim: { x: number; y: number } | null) {
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
    s.blit(ctx, this.sea, dx, dy);
    s.begin(ctx, dx, dy);

    // the floe: a slushy rim where it melts, the ice, a whiter middle and its cracks
    const rr = Math.round(r);
    glow(ctx, C, C, r + 10, "#7cc0f2", 0.12);
    disc(ctx, C, C, rr + 1, "#5d9fc4");
    disc(ctx, C, C, rr, "#bfe3f5");
    disc(ctx, C - 2, C - 2, Math.max(1, rr - 5), "#d8eef8");
    disc(ctx, C - 6, C - 7, Math.max(1, Math.round(rr * 0.45)), "#e9f6fb");
    ctx.fillStyle = "#a5cfe6";
    for (const k of CRACKS) {
      const to = Math.min(k.to, r - 3);
      for (let d = k.from; d < to; d += 1)
        ctx.fillRect(Math.round(C + Math.cos(k.a) * d), Math.round(C + Math.sin(k.a) * d), 1, 1);
    }
    ring(ctx, C, C, rr + 1, "#2f6f96");

    if (aim) {
      ctx.fillStyle = MINE;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(Math.round(aim.x) - 2, Math.round(aim.y), 5, 1);
      ctx.fillRect(Math.round(aim.x), Math.round(aim.y) - 2, 1, 5);
      ctx.globalAlpha = 1;
    }

    for (const b of bodies) {
      if (b.sink >= 1) continue;
      const spr = this.bodies.get(b.color)!;
      if (b.sink > 0) {
        const k = 1 - b.sink;
        ctx.globalAlpha = k;
        const size = (spr.width / s.k) * (0.4 + 0.6 * k);
        ctx.drawImage(spr, s.snap(b.x - size / 2), s.snap(b.y - size / 2), size, size);
        ctx.globalAlpha = 1;
        continue;
      }
      if (b.me) {
        glow(ctx, b.x, b.y, 12, MINE, 0.22);
        if (b.ready < 1)
          ring(ctx, b.x, b.y, BODY_R + 3, shade(MINE, 0.75), -Math.PI / 2, -Math.PI / 2 + b.ready * Math.PI * 2);
        else ring(ctx, b.x, b.y, BODY_R + 3, MINE);
      }
      s.stamp(ctx, spr, b.x, b.y);
      ctx.fillStyle = INK;
      const ex = b.x + b.lx * 2.5;
      const ey = b.y + b.ly * 2.5;
      ctx.fillRect(s.snap(ex - b.ly * 1.8 - 0.5), s.snap(ey + b.lx * 1.8 - 0.5), 1, 1);
      ctx.fillRect(s.snap(ex + b.ly * 1.8 - 0.5), s.snap(ey - b.lx * 1.8 - 0.5), 1, 1);
    }
    this.sparks.draw(ctx, s);
    this.jolt.overlay(ctx, 0, 0, W, W, now);
  }

  dispose() {
    this.screen.dispose();
  }
}

/**
 * Sumo on an ice floe for two or three, played as rollback: each screen slides everyone from what they aim at, its
 * own player with no wait and the others guessed until their aim arrives. A round counts once every screen is sure.
 */
export default function Sumo({
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
    const order = [me, ...seats.map((_, k) => k).filter((k) => k !== me)];
    const colors: string[] = [];
    order.forEach((k, i) => (colors[k] = [MINE, THEIRS, THIRD][i]));
    const view = new SumoView(canvas, colors);
    const cues = new Cues();
    const rules = sumoRules(n);
    const link = new GameLink(sb, `relay-game:${room}:${id}`, self, seats, (from, m) => net.receive(from, m), devLag());
    const net = new Netplay(rules, seats, self, link);
    // turned so this player starts at the bottom: (x, y) on the floe to the screen and back
    const st = STARTS[n][me];
    const turn = Math.PI / 2 - Math.atan2(st.y - C, st.x - C);
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const toScreen = (x: number, y: number) => ({
      x: C + (x - C) * cos - (y - C) * sin,
      y: C + (x - C) * sin + (y - C) * cos,
    });
    const toFloe = (x: number, y: number) => ({
      x: C + (x - C) * cos + (y - C) * sin,
      y: C - (x - C) * sin + (y - C) * cos,
    });
    const keys = new Set<string>();
    let pointer: { x: number; y: number } | null = null;
    let held = false;
    let tap = 0;
    const off = seats.map(() => ({ x: 0, y: 0 }));
    const look = seats.map((_, k) => ({ x: (C - STARTS[n][k].x) / 30, y: (C - STARTS[n][k].y) / 30 }));
    const seen: Seen[] = seats.map((_, k) => ({
      x: 0,
      y: 0,
      lx: 0,
      ly: -1,
      color: colors[k],
      sink: 0,
      me: k === me,
      ready: 1,
    }));
    let shownRound = 0;
    let shownWon: number | null = null;
    let splashed = new Set<number>();
    let splashRound = 0;
    let hitAt = 0;
    let hitN = 0;
    let meltSaid = 0;
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
    sayT(
      n > 2 ? "чекаю на інших…" : "чекаю на суперника…",
      n > 2 ? "waiting for the others…" : "waiting for the other player…",
    );

    net.game.onRewind = (was, now) => {
      if (was.round !== now.round) return;
      for (let k = 0; k < n; k++) {
        off[k].x += was.body[k].x - now.body[k].x;
        off[k].y += was.body[k].y - now.body[k].y;
        if (Math.abs(off[k].x) + Math.abs(off[k].y) > SNAP) off[k].x = off[k].y = 0;
      }
    };

    /** rounds and the end, from the game every screen is sure of */
    const settle = (now: number) => {
      const s = net.game.sure;
      if (s.round !== shownRound) {
        shownRound = s.round;
        shownWon = null;
        if (s.round > 1) {
          say("");
          pop(
            popRef.current,
            tr(uiNow(), `РАУНД ${s.round}`, `ROUND ${s.round}`),
            "#ffffff",
            (s.go - s.n) * STEP_MS + 250,
          );
          cues.at(now + (s.go - s.n) * STEP_MS, () => sfx("go"));
        }
      }
      if (s.won !== null && shownWon === null) {
        shownWon = s.won;
        setTally(order.map((k) => s.score[k]));
        if (s.won >= 0) {
          const ours = s.won === me;
          bump([mineRef, theirsRef, thirdRef][order.indexOf(s.won)].current);
          pop(popRef.current, tr(uiNow(), "ПЛЮХ!", "SPLASH!"), colors[s.won], 900);
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

    const input = (): Push => {
      const b = net.game.state.body[me];
      let aim = pointer ? toFloe(pointer.x, pointer.y) : { x: b.x, y: b.y };
      if (keys.size) {
        let kx = 0;
        let ky = 0;
        keys.forEach((k) => {
          kx += MOVES[k]?.[0] ?? 0;
          ky += MOVES[k]?.[1] ?? 0;
        });
        const at = toScreen(b.x, b.y);
        aim = toFloe(at.x + kx * KEY_REACH, at.y + ky * KEY_REACH);
      }
      const dash = held || tap > 0;
      if (tap > 0) tap -= 1;
      return pushAt(aim.x, aim.y, dash);
    };
    const press = () => {
      if (over || !net.started) return;
      tap = TAP_STEPS;
    };

    /** sounds and sparks of what the game guesses now: a fall or a bump shows at once, and is rarely taken back */
    const react = (s: SumoState, now: number) => {
      if (s.round !== splashRound) {
        splashRound = s.round;
        splashed = new Set();
      }
      s.fell.forEach((f, k) => {
        if (!f || splashed.has(k)) return;
        splashed.add(k);
        const at = toScreen(s.body[k].x, s.body[k].y);
        view.splash(at.x, at.y, now, k === me);
        sfx(k === me ? "conceded" : "wall");
      });
      if (s.hit.n !== hitN) {
        hitN = s.hit.n;
        if (now - hitAt > CLICK_MS && s.hit.n > s.go) {
          hitAt = now;
          const at = toScreen(s.hit.x, s.hit.y);
          view.hit(at.x, at.y, s.hit.power, now);
          sfx("hit");
        }
      }
      if (s.won === null && s.n > s.go + MELT_AFTER && meltSaid !== s.round) {
        meltSaid = s.round;
        sayT("крижина тане!", "the floe is melting!");
      }
    };

    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const draw = (now: number) => {
      const s = net.game.state;
      const p0 = net.prev.round === s.round ? net.prev : s;
      const k = net.between(now);
      for (let i = 0; i < n; i++) {
        const b = s.body[i];
        const a = p0.body[i];
        const at = toScreen(lerp(a.x, b.x, k) + off[i].x, lerp(a.y, b.y, k) + off[i].y);
        const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (v > 0.01) {
          const d = toScreen(C + b.vx / v, C + b.vy / v);
          look[i].x = lerp(look[i].x, d.x - C, 0.2);
          look[i].y = lerp(look[i].y, d.y - C, 0.2);
        }
        const l = Math.sqrt(look[i].x * look[i].x + look[i].y * look[i].y) || 1;
        const o = seen[i];
        o.x = at.x;
        o.y = at.y;
        o.lx = look[i].x / l;
        o.ly = look[i].y / l;
        o.sink = s.fell[i] ? Math.min(1, ((s.n - s.fell[i]) * STEP_MS) / SINK_MS) : 0;
        o.ready = s.n < s.go ? 1 : Math.min(1, 1 - (s.cool[i] - s.n) / DASH_COOL);
      }
      const r = lerp(p0.r, s.r, k);
      view.frame(ctx, now, r, seen, pointer && !keys.size && !over ? pointer : null);
    };

    const point = (e: PointerEvent) => {
      pointer = view.screen.at(e);
      keys.clear();
    };
    const pointDown = (e: PointerEvent) => {
      point(e);
      held = true;
      press();
    };
    const pointUp = () => {
      held = false;
    };
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (over || typing || (!MOVES[key] && !DASH_KEYS.has(e.key))) return;
      e.preventDefault();
      if (DASH_KEYS.has(e.key)) {
        if (!e.repeat) press();
        held = true;
        return;
      }
      keys.add(key);
    };
    const up = (e: KeyboardEvent) => {
      if (DASH_KEYS.has(e.key)) held = false;
      keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    canvas.addEventListener("pointermove", point);
    canvas.addEventListener("pointerdown", pointDown);
    window.addEventListener("pointerup", pointUp);
    window.addEventListener("pointercancel", pointUp);
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
          sayT(
            "штовхни інших у воду: веди мишкою чи пальцем, ривок кліком",
            "push the others into the sea: steer with the mouse or a finger, click to dash",
          );
        }
        const stuck = !!net.stalledSince && now - net.stalledSince > QUIET_MS;
        if (stuck !== quiet) {
          quiet = stuck;
          if (stuck) sayT("суперник не відповідає…", "the other player is not answering…");
          else say("");
        }
        react(net.game.state, now);
        settle(now);
      }
      if (now - lineAt > 1000 && lineRef.current && net.started) {
        lineAt = now;
        lineRef.current.textContent = lineSay(link);
      }
      const fade = Math.pow(0.5, dt / SMOOTH_MS);
      for (const o of off) {
        o.x *= fade;
        o.y *= fade;
      }
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", point);
      canvas.removeEventListener("pointerdown", pointDown);
      window.removeEventListener("pointerup", pointUp);
      window.removeEventListener("pointercancel", pointUp);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
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
    <div className="pong sumo">
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
          height={W * 3}
          aria-label={t(
            "Сумо: веди свій диск мишкою, пальцем, стрілками або WASD, ривок кліком чи пробілом; штовхни інших з крижини",
            "Sumo: steer your puck with the mouse, a finger, the arrows or WASD, dash with a click or space; push the others off the floe",
          )}
        />
      </ArcadeScreen>
    </div>
  );
}
