"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { tr, uiNow, useTr } from "@/lib/i18n";
import { Match, Side, sideOf } from "@/lib/live/duel";
import {
  GOAL_W,
  H,
  HockeyMsg,
  MALLET_R,
  MAX_MALLET,
  Mallet,
  PUCK_R,
  Puck,
  W,
  WIN_AT,
  cleanHockey,
  glide,
  glideFor,
  half,
  keepIn,
  startAt,
} from "@/lib/live/hockey";
import { supabase } from "@/lib/supabaseClient";
import { Ctx, px, shade } from "../cafe/pixel";

const STEP_MS = 4;
const SEND_MS = 50;
const MAL_MS = 40;
const PING_MS = 3000;
const FIRST_MS = 1500;
const NEXT_MS = 1200;
const RESEND_MS = 250;
const QUIET_MS = 2500;
const FINAL_SENDS = 3;
const KEY_SPEED = 0.12;
const MINE = "#ffd25a";
const THEIRS = "#8fb3ff";
const RED = "#d0565b";
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

function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  const x = Math.round(cx);
  const y = Math.round(cy);
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    px(ctx, x - w, y + dy, 2 * w + 1, 1, color);
  }
}

function ring(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  for (let a = 0; a < 160; a++) {
    const t = (a / 160) * Math.PI * 2;
    px(ctx, Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), 1, 1, color);
  }
}

function drawRink(ctx: Ctx) {
  px(ctx, 0, 0, W, H, "#173a52");
  for (let y = 6; y < H; y += 12) for (let x = 6; x < W; x += 12) px(ctx, x, y, 1, 1, "#21496a");
  px(ctx, 1, H / 2, W - 2, 1, RED);
  ring(ctx, W / 2, H / 2, 12, RED);
  ring(ctx, W / 2, 0, GOAL_W / 2 + 2, "#3f6f94");
  ring(ctx, W / 2, H, GOAL_W / 2 + 2, "#3f6f94");
  px(ctx, 0, 0, W, 1, "#e9f2ea");
  px(ctx, 0, H - 1, W, 1, "#e9f2ea");
  px(ctx, 0, 0, 1, H, "#e9f2ea");
  px(ctx, W - 1, 0, 1, H, "#e9f2ea");
  px(ctx, W / 2 - GOAL_W / 2, 0, GOAL_W, 2, "#07050d");
  px(ctx, W / 2 - GOAL_W / 2, H - 2, GOAL_W, 2, "#07050d");
}

function drawMallet(ctx: Ctx, x: number, y: number, color: string) {
  disc(ctx, x, y, MALLET_R, "#07050d");
  disc(ctx, x, y, MALLET_R - 1, color);
  disc(ctx, x, y, 2, shade(color, 1.25));
}

function drawPuck(ctx: Ctx, x: number, y: number) {
  disc(ctx, x, y, PUCK_R, "#07050d");
  disc(ctx, x, y, PUCK_R - 1, "#e8e2d0");
  px(ctx, Math.round(x) - 1, Math.round(y) - 2, 2, 1, "#ffffff");
}

/**
 * Air hockey over the match's own channel. Whoever's half the puck is in rules on it — the hit off their mallet, the
 * goal in their net — and streams it; when it crosses the red line it is handed over, so each mallet is ever judged
 * by its own player's screen.
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
    const home = keepIn(me, W / 2, me === "x" ? H - 14 : 14);
    const mine: Mallet = { ...home, vx: 0, vy: 0 };
    let aim = { ...home };
    let theirs = keepIn(rival, W / 2, rival === "x" ? H - 14 : 14);
    const shown = { ...theirs };
    const score: Record<Side, number> = { x: 0, o: 0 };
    const keys = new Set<string>();
    let puck: Puck | null = null;
    let epoch = 0;
    let boss: Side = "x";
    let heard = true;
    let last: HockeyMsg | null = null;
    let finals = 0;
    let met = false;
    let over = false;
    let serveAt = 0;
    let rtt = 120;
    let sentAt = 0;
    let malAt = 0;
    let sentMal = { x: -1, y: -1 };
    let pingAt = 0;
    let heardAt = 0;
    let quiet = false;
    let raf = 0;
    let prev = 0;

    const ch = sb.channel(`relay-hockey:${room}:${id}`, { config: { broadcast: { self: false } } });
    const send = (m: HockeyMsg) => ch.send({ type: "broadcast", event: "h", payload: m });
    const say = (s: string) => {
      if (sayRef.current) sayRef.current.textContent = s;
    };
    const sayT = (uk: string, en: string) => say(tr(uiNow(), uk, en));
    const hud = () => {
      if (mineRef.current) mineRef.current.textContent = String(score[me]);
      if (theirsRef.current) theirsRef.current.textContent = String(score[rival]);
    };
    const puckMsg = (): HockeyMsg => ({ t: "puck", e: epoch, boss, p: puck, s: [score.x, score.o] });
    const tell = (now: number) => {
      last = puckMsg();
      send(last);
      sentAt = now;
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

    ch.on("broadcast", { event: "h" }, ({ payload }) => {
      const m = cleanHockey(payload);
      if (!m || over) return;
      const now = performance.now();
      heardAt = now;
      if (quiet) {
        quiet = false;
        say("");
      }
      if (m.t === "hello") {
        if (met) return;
        met = true;
        send({ t: "hello" });
        if (me === "x") {
          serveAt = now + FIRST_MS;
          sayT("шайба твоя: бий її битою", "your puck: hit it with your mallet");
        } else sayT("готуйся, шайба в суперника", "get ready, their puck");
      } else if (m.t === "ping") send({ t: "pong", a: m.a });
      else if (m.t === "pong") rtt = Math.min(600, Math.max(20, rtt * 0.6 + (now - m.a) * 0.4));
      else if (m.t === "mal") theirs = keepIn(rival, m.x, m.y);
      else if (m.e > epoch || (m.e === epoch && m.boss === rival && boss === rival)) {
        if (m.e > epoch) say("");
        epoch = m.e;
        boss = m.boss;
        heard = true;
        puck = m.p && glideFor(m.p, rtt / 2);
        score.x = m.s[0];
        score.o = m.s[1];
        hud();
        finish();
      }
    });
    ch.subscribe((s) => {
      if (s !== "SUBSCRIBED") return;
      send({ t: "hello" });
      sayT("чекаю на суперника…", "waiting for the other player…");
    });

    const moveMallet = (dt: number) => {
      const dx = aim.x - mine.x;
      const dy = aim.y - mine.y;
      const d = Math.hypot(dx, dy);
      const k = d > MAX_MALLET * dt ? (MAX_MALLET * dt) / d : 1;
      const next = keepIn(me, mine.x + dx * k, mine.y + dy * k);
      mine.vx = (next.x - mine.x) / dt;
      mine.vy = (next.y - mine.y) / dt;
      mine.x = next.x;
      mine.y = next.y;
    };

    const step = (dt: number, now: number) => {
      moveMallet(dt);
      if (!puck) return;
      if (boss !== me) {
        const g = glide(puck, dt);
        if (!g.goal) puck = g.p;
        return;
      }
      const g = glide(puck, dt, mine);
      if (g.goal) {
        score[rival] += 1;
        epoch += 1;
        boss = me;
        puck = null;
        tell(now);
        hud();
        if (finish()) finals = 1;
        else serveAt = now + NEXT_MS;
        return;
      }
      const struck = Math.abs(g.p.vx - puck.vx) + Math.abs(g.p.vy - puck.vy) > 0.03;
      puck = g.p;
      if (half(puck) === rival) {
        epoch += 1;
        boss = rival;
        heard = false;
        tell(now);
      } else if (struck) tell(now);
    };

    const tx = (x: number) => (me === "x" ? x : W - x);
    const ty = (y: number) => (me === "x" ? y : H - y);
    const draw = () => {
      drawRink(ctx);
      drawMallet(ctx, tx(shown.x), ty(shown.y), THEIRS);
      drawMallet(ctx, tx(mine.x), ty(mine.y), MINE);
      if (puck) drawPuck(ctx, tx(puck.x), ty(puck.y));
    };

    const point = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      const y = ((e.clientY - r.top) / r.height) * H;
      aim = keepIn(me, tx(x), ty(y));
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
      const dt = prev ? Math.min(250, now - prev) : 16;
      prev = now;
      if (!stopRef.current && !over) {
        if (keys.size) {
          let kx = 0;
          let ky = 0;
          keys.forEach((k) => {
            kx += MOVES[k]?.[0] ?? 0;
            ky += MOVES[k]?.[1] ?? 0;
          });
          const flip = me === "x" ? 1 : -1;
          aim = keepIn(me, mine.x + kx * flip * KEY_SPEED * dt, mine.y + ky * flip * KEY_SPEED * dt);
        }
        if (serveAt && now >= serveAt) {
          serveAt = 0;
          epoch += 1;
          boss = me;
          puck = { ...startAt(me), vx: 0, vy: 0 };
          tell(now);
          say("");
        }
        for (let left = dt; left > 0; left -= STEP_MS) step(Math.min(STEP_MS, left), now);
        if (boss === me && puck && now - sentAt >= SEND_MS) tell(now);
        if (boss === rival && !heard && last && now - sentAt >= RESEND_MS) {
          send(last);
          sentAt = now;
        }
        if (met && now - malAt >= MAL_MS && Math.hypot(mine.x - sentMal.x, mine.y - sentMal.y) >= 0.3) {
          malAt = now;
          sentMal = { x: mine.x, y: mine.y };
          send({ t: "mal", x: mine.x, y: mine.y });
        }
        if (met && now - pingAt >= PING_MS) {
          pingAt = now;
          send({ t: "ping", a: now });
        }
        if (boss === rival && !quiet && heardAt && now - heardAt > QUIET_MS) {
          quiet = true;
          sayT("суперник не відповідає…", "the other player is not answering…");
        }
      } else if (over && finals && finals < FINAL_SENDS && last && now - sentAt >= RESEND_MS) {
        finals += 1;
        send(last);
        sentAt = now;
      }
      shown.x += (theirs.x - shown.x) * Math.min(1, dt / 40);
      shown.y += (theirs.y - shown.y) * Math.min(1, dt / 40);
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
  const verdict =
    result === null
      ? null
      : result
        ? t("перемога твоя!", "you win!")
        : t(`перемога: ${rival.name}`, `${rival.name} wins`);
  return (
    <div className="pong hockey">
      <div className="ttt-hd">
        <span>
          {t("ти", "you")} <b ref={mineRef}>0</b> : <b ref={theirsRef}>0</b> {rival.name} · {t("до", "to")} {WIN_AT}
        </span>
        <b>{verdict ?? note ?? <span ref={sayRef} />}</b>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        aria-label={t(
          "Аерохокей: веди биту мишкою, пальцем, стрілками або WASD і забий шайбу у ворота вгорі",
          "Air hockey: move your mallet with the mouse, a finger, the arrows or WASD and score in the goal at the top",
        )}
      />
    </div>
  );
}
