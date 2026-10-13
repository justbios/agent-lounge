"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Match, Side, sideOf } from "@/lib/live/duel";
import {
  Ball,
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
import { supabase } from "@/lib/supabaseClient";
import { Ctx, LINE, px } from "../cafe/pixel";

const STEP_MS = 8;
const PAD_EVERY_MS = 60;
const PING_EVERY_MS = 3000;
const FIRST_SERVE_MS = 1500;
const NEXT_SERVE_MS = 1000;
const QUIET_MS = 2500;

function drawTable(ctx: Ctx) {
  px(ctx, 0, 0, W, H, "#1d3a33");
  px(ctx, 0, 0, W, 1, "#e9f2ea");
  px(ctx, 0, H - 1, W, 1, "#e9f2ea");
  for (let y = 3; y < H - 3; y += 6) px(ctx, W / 2, y, 1, 3, "#5d8a7c");
}

function drawPad(ctx: Ctx, x: number, y: number, color: string) {
  const top = Math.round(y - PAD_H / 2);
  px(ctx, x - 1, top - 1, PAD_W + 2, PAD_H + 2, LINE);
  px(ctx, x, top, PAD_W, PAD_H, color);
}

function drawBall(ctx: Ctx, x: number, y: number) {
  const L = Math.round(x - R);
  const T = Math.round(y - R);
  px(ctx, L, T, 3, 3, "#f6f1e4");
  px(ctx, L + 2, T + 2, 1, 1, "#c9bfa8");
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
    const pads: Record<Side, number> = { x: H / 2, o: H / 2 };
    const score: Record<Side, number> = { x: 0, o: 0 };
    const keys = new Set<string>();
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
    const hud = () => {
      if (mineRef.current) mineRef.current.textContent = String(score[me]);
      if (theirsRef.current) theirsRef.current.textContent = String(score[rival]);
    };
    const finish = () => {
      if (over || Math.max(score.x, score.o) < WIN_AT) return false;
      over = true;
      serveAt = 0;
      const win = score[me] >= WIN_AT;
      setResult(win);
      end(win);
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
        if (me === "x") {
          serveAt = now + FIRST_SERVE_MS;
          say("подаєш ти");
        } else say("готуйся, подає суперник");
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
      say("чекаю на суперника…");
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

    const draw = () => {
      drawTable(ctx);
      const sx = (v: number) => (me === "x" ? v : W - v);
      drawPad(ctx, GAP, pads[me], "#ffd25a");
      drawPad(ctx, W - GAP - PAD_W, shown, "#8fb3ff");
      if (ball) drawBall(ctx, sx(ball.x), ball.y);
    };

    const point = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pads[me] = clampPad(((e.clientY - r.top) / r.height) * H);
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
        if (quietSince && now - quietSince > QUIET_MS) say("суперник не відповідає…");
      }
      shown += (pads[rival] - shown) * Math.min(1, dt / 50);
      draw();
      raf = requestAnimationFrame(loop);
    };
    draw();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", point);
      canvas.removeEventListener("pointerdown", point);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      sb.removeChannel(ch);
    };
  }, [id, me, room]);

  const rival = me === "x" ? match.o : match.x;
  return (
    <div className="pong">
      <div className="ttt-hd">
        <span>
          ти <b ref={mineRef}>0</b> : <b ref={theirsRef}>0</b> {rival.name} · до {WIN_AT}
        </span>
        <b>{result !== null ? (result ? "перемога твоя!" : `перемога: ${rival.name}`) : (note ?? <span ref={sayRef} />)}</b>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        aria-label="Пінг-понг: веди ракетку мишкою, пальцем або стрілками вгору й униз"
      />
    </div>
  );
}
