"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { tr, uiNow, useTr } from "@/lib/i18n";
import { botTable } from "@/lib/live/botLine";
import { sumoBot } from "@/lib/live/bots/sumo";
import { Match, playersOf, seatOf } from "@/lib/live/duel";
import { GameLink, devLag } from "@/lib/live/gameLink";
import { labWatch } from "@/lib/live/lab";
import { Netplay } from "@/lib/live/netplay";
import { hashOf } from "@/lib/live/solo";
import {
  C,
  DASH_COOL,
  FLOE_R,
  MELT_AFTER,
  Push,
  STARTS,
  STEP_MS,
  SumoState,
  WIN_AT,
  pushAt,
  sumoRules,
} from "@/lib/live/sumo";
import { supabase } from "@/lib/supabaseClient";
import { ArcadeSay, ArcadeScreen, lineSay } from "./Arcade";
import { MINE, THEIRS, THIRD, pop } from "./fx";
import { SumoHud } from "./sumo/Hud";
import { PX } from "./sumo/pixels";
import { plate, shout, tag } from "./sumo/signs";
import { Body, SumoView } from "./sumo/view";

const QUIET_MS = 1500;
/** a key aims this far ahead of the wrestler */
const KEY_REACH = 30;
/** a quick tap still counts as a dash for this many steps, so the press is never missed between two steps */
const TAP_STEPS = 3;
/** a dash asked for this many steps before it is back still happens the moment it is */
const EARLY_STEPS = 18;
/** How far a correction still shows, eased off by half every SMOOTH_MS; a jump this big is a new round, not a fix. */
const SMOOTH_MS = 35;
const SNAP = 20;
/** the floe counts as all melted at this radius, for the tension that builds on the way there */
const MELTED_R = 14;
const COLORS = [MINE, THEIRS, THIRD];
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

/**
 * Sumo on an ice floe for two or three, played as rollback: each screen slides everyone from what they aim at, its
 * own player with no wait and the others guessed until their aim arrives. A round counts once every screen is sure.
 * What is drawn and heard is staged by the view in `sumo/`, from what the game says happened.
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
  const sayRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const stopRef = useRef(!!note);
  const [won, setWon] = useState<boolean | null>(null);
  const [tally, setTally] = useState<number[]>([0, 0, 0]);
  const end = useEffectEvent(onEnd);
  const { id, solo } = match;
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
    if (!canvas || !ctx) return;
    const seats = ids.split(" ");
    const who = names.split(" ");
    const n = seats.length;
    const rules = sumoRules(n);
    const hear = (from: string, m: object) => net.receive(from, m);
    // against one of the café's agents the line is a made-up one, with the agent at its far end
    const table = solo ? botTable(seats, self, solo, hashOf(id), rules, sumoBot, hear) : null;
    const wire = !table && sb && room ? new GameLink(sb, `relay-game:${room}:${id}`, self, seats, hear, devLag()) : null;
    const link = table?.link ?? wire;
    if (!link) return;
    const order = [me, ...seats.map((_, k) => k).filter((k) => k !== me)];
    const colors: string[] = [];
    order.forEach((k, i) => (colors[k] = COLORS[i]));
    const net = new Netplay(rules, seats, self, link);
    if (table) labWatch(() => net.game.state);
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

    const say = (s: string) => {
      if (sayRef.current) sayRef.current.textContent = s;
    };
    const sayT = (uk: string, en: string) => say(tr(uiNow(), uk, en));
    sayT(
      n > 2 ? "чекаю на інших…" : "чекаю на суперника…",
      n > 2 ? "waiting for the others…" : "waiting for the other player…",
    );

    const view = new SumoView(
      canvas,
      colors,
      me,
      STARTS[n].map((p) => toScreen(p.x, p.y)),
      {
        banner: (round, point) => {
          // the last round's warning has nothing to say about this one
          for (const a of tagRef.current?.getAnimations() ?? []) a.cancel();
          plate(
            plateRef.current,
            tr(uiNow(), `РАУНД ${round}`, `ROUND ${round}`),
            point ? tr(uiNow(), "матч-пойнт", "match point") : null,
            point ? 1500 : 1250,
          );
        },
        go: () => pop(popRef.current, tr(uiNow(), "БОРИСЬ!", "FIGHT!"), MINE, 700),
        splash: (x, y, big) => shout(wordRef.current, tr(uiNow(), "ПЛЮХ!", "SPLASH!"), x, y, big),
        melt: () => {
          tag(tagRef.current, tr(uiNow(), "крижина тане!", "the ice is melting!"), 2200);
          sayT("крижина тане!", "the floe is melting!");
        },
      },
    );

    const keys = new Set<string>();
    let pointer: { x: number; y: number } | null = null;
    /** the finger that steers; another one only dashes */
    let steering: number | null = null;
    let tap = 0;
    let early = 0;
    let dashed = false;
    const off = seats.map(() => ({ x: 0, y: 0 }));
    const seen: Body[] = seats.map(() => ({ x: C, y: C, vx: 0, vy: 0, fell: false, ready: 1 }));
    let seenRound = 0;
    let shownRound = 0;
    let shownWon: number | null = null;
    let splashed = new Set<number>();
    let cool = seats.map(() => 0);
    let hitN = 0;
    let began = false;
    let over = false;
    let quiet = false;
    let lineAt = 0;
    let raf = 0;
    let prev = 0;

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
        if (s.round > 1) say("");
      }
      if (s.won !== null && shownWon === null) {
        shownWon = s.won;
        setTally(order.map((k) => s.score[k]));
        if (!s.over) view.roundEnd(now, s.won);
        if (s.won < 0) sayT("обидва у воді: нічия", "both in the water: a draw");
        else if (s.won === me) sayT("раунд твій", "your round");
        else sayT(`раунд: ${who[s.won]}`, `${who[s.won]} takes the round`);
      }
      if (s.over && !over) {
        over = true;
        const win = s.score[me] >= WIN_AT;
        setWon(win);
        view.finale(
          now,
          s.score.findIndex((v) => v >= WIN_AT),
        );
        end(win);
      }
    };

    const input = (): Push => {
      if (table?.auto) return table.auto(net.game.state);
      const s = net.game.state;
      const b = s.body[me];
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
      // a press a moment too soon waits for the dash to be back, and for the last press to have been let go
      if (early > 0) {
        early -= 1;
        if (tap === 0 && !dashed && s.n >= s.go && s.n >= s.cool[me]) {
          tap = TAP_STEPS;
          early = 0;
        }
      }
      dashed = tap > 0;
      if (tap > 0) tap -= 1;
      return pushAt(aim.x, aim.y, dashed);
    };
    const press = () => {
      if (over || !net.started) return;
      const s = net.game.state;
      const wait = Math.max(s.go, s.cool[me]) - s.n;
      if (wait <= 0 && !dashed) tap = TAP_STEPS;
      else early = EARLY_STEPS;
      if (wait > EARLY_STEPS && s.n >= s.go && s.won === null) view.deny(performance.now());
    };

    /** what the game guesses happened just now, staged at once: a fall or a bump is rarely taken back */
    const react = (s: SumoState, now: number) => {
      if (s.round !== seenRound) {
        seenRound = s.round;
        splashed = new Set();
        cool = s.cool.slice();
        view.round(now, now + (s.go - s.n) * STEP_MS, s.round, s.round === 1, Math.max(...s.score) === WIN_AT - 1);
      }
      s.fell.forEach((f, k) => {
        if (f && !splashed.has(k)) {
          splashed.add(k);
          view.fall(k, now, s.over);
        } else if (!f && splashed.has(k)) {
          splashed.delete(k);
          view.unfall(k);
        }
      });
      if (s.hit.n !== hitN) {
        hitN = s.hit.n;
        if (s.hit.n > s.go) {
          const at = toScreen(s.hit.x, s.hit.y);
          view.hit(at.x, at.y, s.hit.power, now, s.hit.n);
        }
      }
      s.cool.forEach((c, k) => {
        if (c === cool[k]) return;
        if (c > cool[k] && c > s.n) view.dash(k, now);
        cool[k] = c;
      });
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
        const o = seen[i];
        o.x = at.x;
        o.y = at.y;
        o.vx = b.vx * cos - b.vy * sin;
        o.vy = b.vx * sin + b.vy * cos;
        o.fell = !!s.fell[i];
        o.ready = s.n < s.go ? 1 : Math.min(1, 1 - (s.cool[i] - s.n) / DASH_COOL);
      }
      const r = lerp(p0.r, s.r, k);
      const live = net.started && s.won === null && s.n >= s.go;
      const melt = live && s.n > s.go + MELT_AFTER ? Math.min(1, Math.max(0.02, (FLOE_R - r) / (FLOE_R - MELTED_R))) : 0;
      view.frame(ctx, now, r, seen, pointer && !keys.size && !over ? pointer : null, live, melt);
    };

    const point = (e: PointerEvent) => {
      if (steering !== null && e.pointerId !== steering && e.pointerType === "touch") return;
      const at = view.stage.at(e);
      pointer = { x: C + at.x / PX, y: C + at.y / PX };
      keys.clear();
    };
    const pointDown = (e: PointerEvent) => {
      // a second finger only dashes: the first one goes on steering
      if (e.pointerType !== "touch" || steering === null) {
        steering = e.pointerId;
        point(e);
      }
      press();
    };
    const pointUp = (e: PointerEvent) => {
      if (e.pointerId === steering) steering = null;
    };
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (over || typing || (!MOVES[key] && !DASH_KEYS.has(e.key))) return;
      e.preventDefault();
      if (DASH_KEYS.has(e.key)) {
        if (!e.repeat) press();
        return;
      }
      keys.add(key);
    };
    const up = (e: KeyboardEvent) => {
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
      if (stopRef.current) view.stop();
      if (!stopRef.current && !over) {
        net.run(now, input);
        if (net.started && !began) {
          began = true;
          if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) {
            sayT("штовхни інших у воду: веди пальцем, торкнись ще раз для ривка", "push the others into the sea: steer with a finger, tap again to dash");
          } else {
            sayT(
              "штовхни інших у воду: веди мишкою чи стрілками, ривок кліком чи пробілом",
              "push the others into the sea: steer with the mouse or the arrows, click or space to dash",
            );
          }
        }
        const stuck = !!net.stalledSince && now - net.stalledSince > QUIET_MS;
        if (stuck !== quiet) {
          quiet = stuck;
          if (stuck) sayT("суперник не відповідає…", "the other player is not answering…");
          else say("");
        }
        if (net.started) {
          react(net.game.state, now);
          settle(now);
        }
      }
      if (wire && now - lineAt > 1000 && lineRef.current && net.started) {
        lineAt = now;
        lineRef.current.textContent = lineSay(wire);
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
      if (table) labWatch(null);
    };
  }, [id, ids, me, names, room, self, solo]);

  const verdict =
    won === null ? null : won ? t("перемога твоя!", "you win!") : t("перемога не твоя цього разу", "not your win this time");
  return (
    <div className="pong sumo">
      <SumoHud
        seats={[
          { name: t("ти", "you"), color: MINE, score: tally[0], me: true },
          ...others.map((p, i) => ({ name: p.name, color: COLORS[i + 1], score: tally[i + 1], me: false })),
        ]}
        winAt={WIN_AT}
        to={t(`до ${WIN_AT}`, `to ${WIN_AT}`)}
      />
      <ArcadeSay>{verdict ?? note ?? <span ref={sayRef} />}</ArcadeSay>
      <ArcadeScreen popRef={popRef} final={null} rival="" lineRef={lineRef}>
        <canvas
          ref={canvasRef}
          width={656}
          height={656}
          aria-label={t(
            "Сумо: веди свого борця мишкою, пальцем, стрілками або WASD, ривок кліком чи пробілом; штовхни інших з крижини",
            "Sumo: steer your wrestler with the mouse, a finger, the arrows or WASD, dash with a click or space; push the others off the floe",
          )}
        />
        <div className="sumo-plate" ref={plateRef} aria-hidden>
          <b />
          <i />
        </div>
        <div className="sumo-word" ref={wordRef} aria-hidden />
        <div className="sumo-tag" ref={tagRef} aria-hidden />
      </ArcadeScreen>
    </div>
  );
}
