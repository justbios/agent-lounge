"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { tr, uiNow, useTr } from "@/lib/i18n";
import { botTable } from "@/lib/live/botLine";
import { hockeyBot } from "@/lib/live/bots/hockey";
import { Match, Side, sideOf } from "@/lib/live/duel";
import { GameLink, devLag } from "@/lib/live/gameLink";
import {
  Aim,
  FIRST_STEPS,
  H,
  HEAT_STEPS,
  HEAT_TOP,
  HOCKEY,
  MALLET_R,
  NEXT_STEPS,
  PUCK_R,
  STEP_MS,
  W,
  WIN_AT,
  aimAt,
  heatOf,
  startAt,
} from "@/lib/live/hockey";
import { labWatch } from "@/lib/live/lab";
import { Netplay } from "@/lib/live/netplay";
import { hashOf } from "@/lib/live/solo";
import { sndFinal, sndGo, sndGoal, sndHeart, sndHeat, sndLights, sndPoint, sndTick } from "@/lib/live/sounds/hockey";
import { supabase } from "@/lib/supabaseClient";
import { lineSay } from "./Arcade";
import { INTRO_MS } from "./beats";
import { Cues, MINE, THEIRS, bump, pop } from "./fx";
import { Scoreboard } from "./hockey/Scoreboard";
import { END, FULL_H, FULL_W, HEAT_GLOW, PINK } from "./hockey/rink";
import { Look, RinkView, Spot } from "./hockey/view";

const QUIET_MS = 1500;
/** how fast the keys carry the mallet, units/ms, once they have been held this long; a tap moves it gently */
const KEY_SPEED = 0.14;
const KEY_RAMP_MS = 180;
/** the beats before the first puck are this far apart */
const BEAT_MS = 450;
/** a match point is called this long after the goal that made it, once that goal has had its moment */
const POINT_AT = 1150;
/** the gauge of the puck's heat is written this often */
const GAUGE_MS = 120;
const SIDES: readonly Side[] = ["x", "o"];
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

/** the highest and the lowest a mallet goes in its own half, as its player sees the rink */
const HIGH = H / 2 + MALLET_R + PUCK_R;
const LOW = H - MALLET_R;

/** How a correction still shows, eased off by half every SMOOTH_MS; a jump this big is a new puck, not a fix. */
const SMOOTH_MS = 35;
const SNAP = 20;

/**
 * Air hockey as rollback: each screen plays the whole rink from both players' aims, its own player's mallet with no
 * wait at all and the other one guessed until their aim arrives, then quietly corrected. A goal counts once both
 * screens are sure of it. Everything a match is staged with (the lights coming on, the goal's moment, the match
 * point, the last goal) is read off that game and drawn; none of it is ever written back.
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
  const heatRef = useRef<HTMLSpanElement>(null);
  const sayRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const stopRef = useRef(!!note);
  const [won, setWon] = useState<boolean | null>(null);
  const [tally, setTally] = useState<[number, number]>([0, 0]);
  const end = useEffectEvent(onEnd);
  const { id, solo } = match;
  const me: Side = sideOf(match, self) ?? "o";
  const ids = `${match.x.id} ${match.o.id}`;

  useEffect(() => {
    stopRef.current = !!note;
  }, [note]);

  useEffect(() => {
    const sb = supabase;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const seat = me === "x" ? 0 : 1;
    const rival = 1 - seat;
    const seats = ids.split(" ");
    const hear = (from: string, m: object) => net.receive(from, m);
    // against one of the café's agents the line is a made-up one, with the agent at its far end
    const table = solo ? botTable(seats, self, solo, hashOf(id), HOCKEY, hockeyBot, hear) : null;
    const wire = !table && sb && room ? new GameLink(sb, `relay-game:${room}:${id}`, self, seats, hear, devLag()) : null;
    const link = table?.link ?? wire;
    if (!link) return;
    const view = new RinkView(canvas);
    const cues = new Cues();
    const net = new Netplay(HOCKEY, seats, self, link);
    if (table) labWatch(() => net.game.state);
    const keys = new Set<string>();
    const home = HOCKEY.idle(seat);
    /** where the mallet is told to go, in the game's own frame */
    let pointer = { x: home.x, y: home.y };
    /** where the hand is as this viewer sees the rink: a mouse, or a finger with the mallet riding above it */
    let mouse: Spot | null = null;
    let finger: Spot | null = null;
    let touch = -1;
    let keyAt = 0;
    let clock = 0;
    const off = { px: 0, py: 0, mx: 0, my: 0 };
    const sp = { x: 0, y: 0, vx: 0, vy: 0 };
    const look: Look = {
      puck: null,
      mine: { x: 0, y: 0 },
      theirs: { x: 0, y: 0 },
      heat: 0,
      dropIn: -1,
      drop: { x: 0, y: 0 },
      aim: null,
      finger: null,
    };
    const seen = [0, 0];
    const tense = { mine: false, theirs: false };
    let warmth = 0;
    let hint = "";
    let began = false;
    let over = false;
    let quiet = false;
    let lineAt = 0;
    let gaugeAt = 0;
    let raf = 0;
    let prev = 0;

    const say = (uk: string, en: string) => tr(uiNow(), uk, en);
    /** the line under the board: what matters most right now */
    const status = () => {
      const el = sayRef.current;
      if (!el) return;
      let text = hint;
      let color = "";
      if (!net.started) text = say("чекаю на суперника…", "waiting for the other player…");
      else if (quiet) text = say("суперник не відповідає…", "the other player is not answering…");
      else if (over) text = "";
      else if (warmth > 0) {
        color = HEAT_GLOW[warmth];
        text =
          warmth === 1
            ? say("шайба гріється: летить швидше", "the puck is warming up: it flies faster")
            : warmth === 2
              ? say("шайба гаряча!", "the puck is hot!")
              : say("шайба розпечена!", "the puck is red-hot!");
      } else if (tense.mine && tense.theirs) {
        color = PINK;
        text = say("наступний гол вирішує матч", "the next goal wins the match");
      } else if (tense.mine) {
        color = MINE;
        text = say("матч-пойнт: ще один гол, і перемога твоя", "match point: one more goal and you win");
      } else if (tense.theirs) {
        color = THEIRS;
        text = say("матч-пойнт у суперника: тримай ворота", "match point against you: hold your goal");
      }
      el.textContent = text;
      el.style.color = color;
    };
    /** big words over the ice, sized so that the longest still fits across it */
    const call = (text: string, color: string, ms?: number) => {
      const el = popRef.current;
      if (!el) return;
      el.style.fontSize = `calc(var(--rink) * ${Math.min(0.2, 1.2 / text.length).toFixed(3)})`;
      pop(el, text, color, ms);
    };
    status();

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
    const settle = (now: number) => {
      const s = net.game.sure;
      for (const k of [0, 1]) {
        if (s.score[k] <= seen[k]) continue;
        seen[k] = s.score[k];
        const ours = k === seat;
        const last = s.over;
        view.goal(ours, now, last);
        bump(ours ? mineRef.current : theirsRef.current);
        call(say("ГОЛ!", "GOAL!"), ours ? MINE : THEIRS, last ? 1300 : 900);
        if (last) sndFinal(ours);
        else sndGoal(ours);
        if (last) continue;
        // a goal from the end: called once the goal has had its moment, and felt until the match is over
        const mine = s.score[seat] === WIN_AT - 1;
        const theirs = s.score[rival] === WIN_AT - 1;
        if ((mine || theirs) && (mine !== tense.mine || theirs !== tense.theirs)) {
          cues.at(now + POINT_AT, () => {
            tense.mine = mine;
            tense.theirs = theirs;
            view.point(mine, theirs);
            if (mine && theirs) call(say("ВИРІШАЛЬНИЙ ГОЛ", "NEXT GOAL WINS"), PINK, 850);
            else call(say("МАТЧ-ПОЙНТ", "MATCH POINT"), mine ? MINE : THEIRS, 850);
            sndPoint();
            status();
          });
        }
        if (mine || theirs) cues.at(now + NEXT_STEPS * STEP_MS - 560, () => sndHeart());
      }
      setTally((p) => (p[0] === s.score[seat] && p[1] === s.score[rival] ? p : [s.score[seat], s.score[rival]]));
      if (s.over && !over) {
        over = true;
        const win = s.score[seat] >= WIN_AT;
        tense.mine = tense.theirs = false;
        view.point(false, false);
        heatRef.current?.style.setProperty("--h", "0");
        setWon(win);
        end(win);
        status();
      }
    };

    const flip = me === "x" ? 1 : -1;
    const tx = (x: number) => (me === "x" ? x : W - x);
    const ty = (y: number) => (me === "x" ? y : H - y);
    const input = (): Aim => {
      if (table?.auto) return table.auto(net.game.state);
      if (!keys.size) return aimAt(me, pointer.x, pointer.y);
      let kx = 0;
      let ky = 0;
      keys.forEach((k) => {
        kx += MOVES[k]?.[0] ?? 0;
        ky += MOVES[k]?.[1] ?? 0;
      });
      const m = net.game.state.mal[seat];
      const far = Math.hypot(kx, ky);
      if (!far) return aimAt(me, m.x, m.y);
      // eased in, so a tap nudges and a held key runs; the same pace along a slant as straight
      const run = (KEY_SPEED * STEP_MS * 2 * Math.min(1, 0.25 + (0.75 * (clock - keyAt)) / KEY_RAMP_MS)) / far;
      const a = aimAt(me, m.x + kx * flip * run, m.y + ky * flip * run);
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
      look.puck = p ? sp : null;
      look.mine.x = tx(lerp(p0.mal[seat].x, s.mal[seat].x, k));
      look.mine.y = ty(lerp(p0.mal[seat].y, s.mal[seat].y, k));
      look.theirs.x = tx(lerp(p0.mal[rival].x, s.mal[rival].x, k) + off.mx);
      look.theirs.y = ty(lerp(p0.mal[rival].y, s.mal[rival].y, k) + off.my);
      look.heat = p ? heatOf(s) : 0;
      if (s.serve && !s.over && net.started) {
        const at = startAt(SIDES[s.to]);
        look.dropIn = Math.max(0, (s.serve - s.n + 1 - k) * STEP_MS);
        look.drop.x = tx(at.x);
        look.drop.y = ty(at.y);
      } else look.dropIn = -1;
      look.aim = keys.size || table?.auto ? null : mouse;
      look.finger = finger;
      view.frame(ctx, now, look);
    };

    /**
     * A mouse leads the mallet from anywhere in the window. A finger carries it above itself, in sight: by the whole
     * lift up at the middle line and a little less toward its own boards, so a finger still on the rink brings the
     * mallet all the way home.
     */
    const take = (e: PointerEvent, byTouch: boolean) => {
      const at = view.at(e);
      const lift = view.lifted();
      const y = byTouch ? HIGH + ((at.y - HIGH - lift) * (LOW - HIGH)) / (H + END - 2 - HIGH - lift) : at.y;
      pointer = { x: tx(at.x), y: ty(y) };
      keys.clear();
      finger = byTouch ? at : null;
      mouse = byTouch ? null : { x: at.x, y };
    };
    const move = (e: PointerEvent) => {
      if (over || stopRef.current) return;
      if (e.pointerType !== "touch") take(e, false);
      else if (e.pointerId === touch) take(e, true);
    };
    const press = (e: PointerEvent) => {
      if (over || stopRef.current) return;
      if (e.pointerType === "touch") touch = e.pointerId;
      take(e, e.pointerType === "touch");
    };
    const lift = (e: PointerEvent) => {
      if (e.pointerId !== touch) return;
      touch = -1;
      finger = null;
    };
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (over || typing || !MOVES[key]) return;
      if (!keys.size) keyAt = performance.now();
      keys.add(key);
      mouse = null;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const blur = () => keys.clear();
    canvas.addEventListener("pointerdown", press);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", lift);
    window.addEventListener("pointercancel", lift);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);

    const loop = () => {
      const now = performance.now();
      const dt = prev ? Math.min(100, now - prev) : 16;
      prev = now;
      clock = now;
      if (stopRef.current) cues.clear();
      cues.run(now);
      if (!stopRef.current && !over) {
        net.run(now, input);
        if (net.started && !began) {
          began = true;
          // the first puck: the lights come on as the opening leaves the rink, three beats, and it lands
          const go = now + (FIRST_STEPS - net.game.frame) * STEP_MS;
          const lights = Math.min(now + INTRO_MS, go - 3 * BEAT_MS - 200);
          cues.at(lights, () => {
            view.lightsOn(lights);
            sndLights();
          });
          for (let i = 0; i < 3; i++) {
            cues.at(go - (3 - i) * BEAT_MS, () => {
              call(String(3 - i), "#ffffff", BEAT_MS * 1.4);
              sndTick(i);
            });
          }
          cues.at(go, () => {
            call(say("ГРАЙ!", "GO!"), MINE);
            sndGo();
          });
          hint = me === "x" ? say("шайба твоя: бий її битою", "your puck: hit it with your mallet") : say("готуйся, шайба в суперника", "get ready, their puck");
          cues.at(go + 2500, () => {
            hint = "";
            status();
          });
          status();
        }
        const stuck = !!net.stalledSince && now - net.stalledSince > QUIET_MS;
        if (stuck !== quiet) {
          quiet = stuck;
          status();
        }
        settle(now);
        // the puck warming up, a step at a time
        const s = net.game.state;
        const heat = s.puck && !over ? heatOf(s) : 0;
        if (heat !== warmth) {
          if (heat > warmth) {
            view.warm(heat, now);
            sndHeat(heat);
          }
          warmth = heat;
          status();
        }
        if (now - gaugeAt > GAUGE_MS && heatRef.current) {
          gaugeAt = now;
          heatRef.current.style.setProperty("--h", (s.puck && !over ? Math.min(HEAT_TOP, s.hot / HEAT_STEPS) : 0).toFixed(2));
        }
      }
      if (wire && now - lineAt > 1000 && lineRef.current && net.started) {
        lineAt = now;
        lineRef.current.textContent = lineSay(wire);
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
      canvas.removeEventListener("pointerdown", press);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", lift);
      window.removeEventListener("pointercancel", lift);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      view.dispose();
      link.close();
      if (table) labWatch(null);
    };
  }, [id, ids, me, room, self, solo]);

  const rival = me === "x" ? match.o : match.x;
  return (
    <div className="pong hockey hk">
      <Scoreboard
        rival={rival.name}
        winAt={WIN_AT}
        mine={tally[0]}
        theirs={tally[1]}
        won={won}
        mineRef={mineRef}
        theirsRef={theirsRef}
        heatRef={heatRef}
      />
      <div className="hk-say" role="status">
        {note ?? <span ref={sayRef} />}
      </div>
      <div className="hk-screen">
        <canvas
          ref={canvasRef}
          width={FULL_W * 3}
          height={FULL_H * 3}
          aria-label={t(
            "Аерохокей: веди биту мишкою, пальцем, стрілками або WASD і забий шайбу у ворота вгорі",
            "Air hockey: move your mallet with the mouse, a finger, the arrows or WASD and score in the goal at the top",
          )}
        />
        <span className="hk-line" ref={lineRef} />
        <div className="hk-pop" ref={popRef} aria-hidden />
      </div>
    </div>
  );
}
