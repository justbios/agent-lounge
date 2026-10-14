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
import { Match, Side, sideOf } from "@/lib/live/duel";
import { supabase } from "@/lib/supabaseClient";
import { Ctx, LINE, px, shade } from "../cafe/pixel";

const W = CW * CELL;
const H = CH * CELL;
const FIRST_MS = 1500;
const SHOW_CRASH_MS = 1200;
const NEXT_MS = 600;
const QUIET_MS = 2500;
const RESEND_MS = 400;
const HELLO_MS = 1000;
const SWIPE_PX = 14;
const MINE = "#ffd25a";
const THEIRS = "#8fb3ff";
const KEYS: Record<string, Dir> = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 };

function drawFloor(ctx: Ctx) {
  px(ctx, 0, 0, W, H, "#1a1d2b");
  for (let y = 4; y < H; y += 10) for (let x = 4; x < W; x += 10) px(ctx, x, y, 1, 1, "#2c3149");
}

function drawCable(ctx: Ctx, x: number, y: number, color: string) {
  px(ctx, x * CELL, y * CELL, CELL, CELL, color);
  px(ctx, x * CELL + 1, y * CELL + 1, 1, 1, shade(color, 0.72));
}

function drawPlug(ctx: Ctx, x: number, y: number, color: string) {
  px(ctx, x * CELL - 1, y * CELL - 1, CELL + 2, CELL + 2, LINE);
  px(ctx, x * CELL, y * CELL, CELL, CELL, shade(color, 1.25));
}

function drawSpark(ctx: Ctx, x: number, y: number) {
  px(ctx, x * CELL - 2, y * CELL, CELL + 4, CELL, "#ff8a5b");
  px(ctx, x * CELL, y * CELL - 2, CELL, CELL + 4, "#ff8a5b");
  px(ctx, x * CELL, y * CELL, CELL, CELL, "#fff4c9");
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mineRef = useRef<HTMLElement>(null);
  const theirsRef = useRef<HTMLElement>(null);
  const sayRef = useRef<HTMLSpanElement>(null);
  const stopRef = useRef(!!note);
  const [result, setResult] = useState<boolean | null>(null);
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
    ctx.imageSmoothingEnabled = false;
    const rival: Side = me === "x" ? "o" : "x";
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
    const hud = () => {
      if (mineRef.current) mineRef.current.textContent = String(score[me]);
      if (theirsRef.current) theirsRef.current.textContent = String(score[rival]);
    };

    const draw = () => {
      drawFloor(ctx);
      const g = field.grid;
      for (let i = 0; i < g.length; i++) {
        if (g[i]) drawCable(ctx, sx(i % CW), Math.floor(i / CW), (g[i] === 1 ? "x" : "o") === me ? MINE : THEIRS);
      }
      for (const s of SIDES) drawPlug(ctx, sx(field.head[s].x), field.head[s].y, s === me ? MINE : THEIRS);
      for (const c of field.crash) drawSpark(ctx, sx(c.x), c.y);
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
      draw();
    };

    const roundOver = (crashed: Side[], now: number) => {
      playing = false;
      if (crashed.length === 1) {
        const winner: Side = crashed[0] === "x" ? "o" : "x";
        score[winner] += 1;
        hud();
        say(winner === me ? "раунд твій" : "раунд суперника");
      } else say("нічия, ще раз");
      if (Math.max(score.x, score.o) >= WIN_AT) {
        over = true;
        const win = score[me] >= WIN_AT;
        setResult(win);
        end(win);
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
      const crashed = step(field, { [me]: mine, [rival]: theirs } as Record<Side, Dir>);
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
        say("твій кабель жовтий, ліворуч");
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
      say("чекаю на суперника…");
    });

    const turn = (d: Dir) => {
      if (over || want.length >= 3) return;
      want.push(me === "o" && d % 2 === 1 ? (((d + 2) % 4) as Dir) : d);
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
        let moved = false;
        for (let i = 0; playing && i < 3 && now >= nextAt; i++) {
          if (!advance(now)) break;
          moved = true;
          nextAt = Math.max(nextAt + TICK_MS, now - TICK_MS);
        }
        if (moved) draw();
        if (playing && waitSince) {
          if (last && now - sentAt > RESEND_MS) {
            send(last);
            sentAt = now;
          }
          if (!quiet && now - waitSince > QUIET_MS) {
            quiet = true;
            say("суперник не відповідає…");
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    draw();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", press);
      canvas.removeEventListener("pointermove", drag);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("keydown", down);
      sb.removeChannel(ch);
    };
  }, [id, me, room]);

  const rival = me === "x" ? match.o : match.x;
  const verdict = result === null ? null : result ? "перемога твоя!" : `перемога: ${rival.name}`;
  return (
    <div className="pong">
      <div className="ttt-hd">
        <span>
          ти <b ref={mineRef}>0</b> : <b ref={theirsRef}>0</b> {rival.name} · до {WIN_AT}
        </span>
        <b>{verdict ?? note ?? <span ref={sayRef} />}</b>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        aria-label="Кабелі: повертай стрілками, WASD або проведи пальцем; не врізайся у стіни й кабелі"
      />
    </div>
  );
}
