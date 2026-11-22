"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { tr, uiNow, useTr } from "@/lib/i18n";
import { botTable } from "@/lib/live/botLine";
import { pongBot } from "@/lib/live/bots/pong";
import { Match, Side, sideOf } from "@/lib/live/duel";
import { GameLink, devLag } from "@/lib/live/gameLink";
import { labWatch } from "@/lib/live/lab";
import { Netplay } from "@/lib/live/netplay";
import { FIRST_STEPS, H, STEP_MS, W, WIN_AT, clampPad, matchPoint, padAt, pongRules, seedOf, serve, serveTilt } from "@/lib/live/pong";
import { tense } from "@/lib/live/sounds/pong";
import { supabase } from "@/lib/supabaseClient";
import { ArcadeSay, lineSay } from "./Arcade";
import { Cues, MINE, THEIRS, countdown, pop } from "./fx";
import { PingHud } from "./pong/Hud";
import { PINK } from "./pong/look";
import { PongView, Scene } from "./pong/view";

const QUIET_MS = 1500;
/** a rally this long is worth a word once it is over */
const LONG_RALLY = 8;
/** the keys move the paddle gently at first and at full pace once held, units/ms */
const KEY_SLOW = 0.07;
const KEY_FAST = 0.16;
const KEY_RAMP_MS = 140;
/** how long after a point the next serve, or the point that can end the match, is told */
const TELL_MS = 700;
/** on a narrow upright screen the table stands on end, your paddle at the bottom under your thumb */
const TALL = "(max-width: 600px) and (orientation: portrait)";

function watchTall(cb: () => void) {
  const mq = matchMedia(TALL);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const isTall = () => matchMedia(TALL).matches;
const notTall = () => false;

/** How far a correction still shows, eased off by half every SMOOTH_MS; a jump this big is a new serve, not a fix. */
const SMOOTH_MS = 35;
const SNAP = 30;

/**
 * Ping-pong as rollback: each screen plays the whole table from both paddles, its own player's with no wait at all
 * and the other one guessed until it arrives, then quietly corrected. A point counts once both screens are sure of it.
 * The table itself (`PongView`) only ever reads the game; when the match ends it keeps a quiet victory on the felt
 * and leaves the result to the frame round it.
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
  const zoneRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLElement>(null);
  const sayRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const stopRef = useRef(!!note);
  const tall = useSyncExternalStore(watchTall, isTall, notTall);
  const tallRef = useRef(tall);
  const nameRef = useRef("");
  const [won, setWon] = useState<boolean | null>(null);
  const [tally, setTally] = useState<[number, number]>([0, 0]);
  /** who is a point from winning, from this seat: 1 you, 2 the other player, 3 both */
  const [point, setPoint] = useState(0);
  const end = useEffectEvent(onEnd);
  const { id, solo } = match;
  const me: Side = sideOf(match, self) ?? "o";
  const ids = `${match.x.id} ${match.o.id}`;
  const rivalName = (me === "x" ? match.o : match.x).name;

  useEffect(() => {
    stopRef.current = !!note;
  }, [note]);
  useEffect(() => {
    tallRef.current = tall;
  }, [tall]);
  useEffect(() => {
    nameRef.current = rivalName;
  }, [rivalName]);

  useEffect(() => {
    const sb = supabase;
    const canvas = canvasRef.current;
    const zone = zoneRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !zone || !ctx) return;
    const seat = me === "x" ? 0 : 1;
    const rival = 1 - seat;
    const seats = ids.split(" ");
    const seed = seedOf(id);
    const rules = pongRules(seed);
    const hear = (from: string, m: object) => net.receive(from, m);
    // against one of the café's agents the line is a made-up one, with the agent at its far end
    const table = solo ? botTable(seats, self, solo, seed, rules, pongBot, hear) : null;
    const wire = !table && sb && room ? new GameLink(sb, `relay-game:${room}:${id}`, self, seats, hear, devLag()) : null;
    const link = table?.link ?? wire;
    if (!link) return;
    const view = new PongView(canvas, tallRef.current);
    // the scoreboard's lamps light when the table's own digit turns over, not before
    view.onTally = (mine, theirs) => setTally([mine, theirs]);
    const cues = new Cues();
    const net = new Netplay(rules, seats, self, link);
    if (table) labWatch(() => net.game.state);
    const keys = new Set<string>();
    const fingers = new Set<number>();
    const off = { bx: 0, by: 0, pad: 0 };
    const seenBall = { x: 0, y: 0, vx: 0, vy: 0 };
    const aim = { vx: 0, vy: 0 };
    const scene: Scene = {
      ball: null,
      dead: false,
      rally: 0,
      tip: false,
      mine: H / 2,
      theirs: H / 2,
      serveIn: -1,
      server: 0,
      aim: null,
      match: 0,
      first: true,
    };
    const seen = [0, 0];
    let pad = H / 2;
    let heldFor = 0;
    let heldWay = 0;
    let tally0 = 0;
    let tally1 = 0;
    let began = false;
    let over = false;
    let quiet = false;
    /** the line under the scoreboard says who serves: it goes once the rally is on */
    let serveTold = false;
    let lineAt = 0;
    let raf = 0;
    let prev = 0;

    const say = (s: string) => {
      if (sayRef.current) sayRef.current.textContent = s;
    };
    const now2 = (uk: string, en: string) => tr(uiNow(), uk, en);
    say(now2("чекаю на суперника…", "waiting for the other player…"));
    /** who serves next, in words */
    const serveSay = (mine: boolean) =>
      mine
        ? now2("подаєш ти", "your serve")
        : now2(`подає ${nameRef.current}: готуйся`, `${nameRef.current} serves: get ready`);
    /** a point that can end the match, in words: 1 this seat's, 2 the other's, 3 either's */
    const pointSay = (who: number) =>
      who === 3
        ? now2("вирішальне очко: хто його візьме, той і виграв", "deciding point: whoever takes it wins")
        : who === 1
          ? now2("матчбол: ще одне очко, і перемога твоя", "match point: one more and the match is yours")
          : now2(
              `матчбол: ${nameRef.current} за крок до перемоги`,
              `match point: ${nameRef.current} is one point away`,
            );

    net.game.onRewind = (was, now) => {
      if (was.ball && now.ball) {
        off.bx += was.ball.x - now.ball.x;
        off.by += was.ball.y - now.ball.y;
      }
      off.pad += was.pads[rival] - now.pads[rival];
      if (Math.abs(off.bx) + Math.abs(off.by) > SNAP) off.bx = off.by = 0;
    };

    /** the points and the end, from the game both screens are sure of */
    const settle = () => {
      const s = net.game.sure;
      const now = performance.now();
      for (const k of [0, 1]) {
        if (s.score[k] <= seen[k]) continue;
        seen[k] = s.score[k];
        view.point(k === seat, s.over, now);
        if (s.over) continue;
        const long = s.rally >= LONG_RALLY ? now2(`розіграш на ${s.rally} ударів`, `a ${s.rally}-hit rally`) : "";
        const mp = matchPoint(s.score);
        const who = mp === 0 || mp === 3 ? mp : mp === seat + 1 ? 1 : 2;
        const next = who ? "" : serveSay(s.to === seat);
        say(long && next ? `${long} · ${next}` : long || next);
        serveTold = !who;
        if (!who) continue;
        // a point that can end the match is called out once the table has answered the last one
        cues.at(now + TELL_MS, () => {
          const color = who === 3 ? PINK : who === 1 ? MINE : THEIRS;
          pop(popRef.current, who === 3 ? now2("ВИРІШАЛЬНЕ ОЧКО", "DECIDING POINT") : now2("МАТЧБОЛ", "MATCH POINT"), color, 1250);
          tense();
          setPoint(who);
          if (!quiet) say(pointSay(who));
        });
      }
      if (s.score[seat] !== tally0 || s.score[rival] !== tally1) {
        tally0 = s.score[seat];
        tally1 = s.score[rival];
        view.score(tally0, tally1);
      }
      if (s.over && !over) {
        over = true;
        keys.clear();
        const win = s.score[seat] >= WIN_AT;
        setPoint(0);
        say("");
        end(win);
        // the words wait for the table to have had its say
        cues.at(now + TELL_MS, () => setWon(win));
      }
    };

    const input = () => (table?.auto ? table.auto(net.game.state) : padAt(pad));
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const draw = (now: number) => {
      const s = net.game.state;
      const p0 = net.prev;
      const k = net.between(now);
      const b = s.ball;
      if (b) {
        const q = p0.ball ?? b;
        const x = lerp(q.x, b.x, k) + off.bx;
        seenBall.x = me === "x" ? x : W - x;
        seenBall.y = lerp(q.y, b.y, k) + off.by;
        seenBall.vx = me === "x" ? b.vx : -b.vx;
        seenBall.vy = b.vy;
      } else off.bx = off.by = 0;
      const playing = net.started && !stopRef.current;
      scene.ball = b && seenBall;
      scene.dead = s.dead;
      scene.rally = s.rally;
      scene.tip = s.tip;
      // one's own paddle is drawn where the hand is this very frame; the game reads the same place at its next step
      scene.mine = playing && !table?.auto ? padAt(pad) : lerp(p0.pads[seat], s.pads[seat], k);
      scene.theirs = lerp(p0.pads[rival], s.pads[rival], k) + off.pad;
      scene.serveIn = playing && s.serve ? Math.max(0, s.serve - s.n - k) * STEP_MS : -1;
      scene.server = s.to === seat ? 0 : 1;
      scene.first = s.serve === FIRST_STEPS;
      if (scene.serveIn >= 0) {
        const sv = serve(s.to === 0 ? "x" : "o", serveTilt(seed, s.score[0] + s.score[1]), s.pads[s.to]);
        aim.vx = me === "x" ? sv.vx : -sv.vx;
        aim.vy = sv.vy;
        scene.aim = aim;
      } else scene.aim = null;
      const mp = s.over ? 0 : matchPoint(s.score);
      scene.match = mp === 0 || mp === 3 ? mp : mp === seat + 1 ? 1 : 2;
      view.frame(ctx, now, scene);
      if (thumbRef.current) thumbRef.current.style.transform = `translateX(${((scene.mine / H) * 100).toFixed(2)}%)`;
    };

    const steer = (e: PointerEvent) => {
      pad = clampPad(view.stage.at(e));
    };
    // the mouse steers from anywhere on the page, so the paddle never sticks when the pointer leaves the table
    const move = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || fingers.has(e.pointerId)) steer(e);
    };
    const press = (e: PointerEvent) => {
      fingers.add(e.pointerId);
      steer(e);
    };
    const lift = (e: PointerEvent) => fingers.delete(e.pointerId);
    const down = (e: KeyboardEvent) => {
      if (over || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "s", "a", "d"].includes(e.key)) return;
      keys.add(e.key);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key);
    const has = (...list: string[]) => (list.some((key) => keys.has(key)) ? 1 : 0);
    zone.addEventListener("pointerdown", press);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", lift);
    window.addEventListener("pointercancel", lift);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    const loop = () => {
      const now = performance.now();
      const dt = prev ? Math.min(100, now - prev) : 16;
      prev = now;
      view.turn(tallRef.current);
      if (stopRef.current) cues.clear();
      cues.run(now);
      if (!stopRef.current) {
        // up and down on a lying table; on a standing one the paddle runs left and right
        const dir = view.stage.tall
          ? has("ArrowRight", "d", "ArrowDown", "s") - has("ArrowLeft", "a", "ArrowUp", "w")
          : has("ArrowDown", "s") - has("ArrowUp", "w");
        if (dir) {
          heldFor = dir === heldWay ? heldFor + dt : 0;
          heldWay = dir;
          pad = clampPad(pad + dir * dt * (KEY_SLOW + (KEY_FAST - KEY_SLOW) * Math.min(1, heldFor / KEY_RAMP_MS)));
        } else heldWay = 0;
        // the table stays alive after the last point: the paddles still answer, the last ball flies out
        net.run(now, input);
        if (net.started && !began) {
          began = true;
          countdown(cues, () => popRef.current, now, now + FIRST_STEPS * STEP_MS);
          say(serveSay(me === "x"));
          serveTold = true;
        }
        const stuck = !over && !!net.stalledSince && now - net.stalledSince > QUIET_MS;
        if (stuck !== quiet) {
          quiet = stuck;
          if (stuck) say(now2("суперник не відповідає…", "the other player is not answering…"));
          else say("");
        }
        if (!over) settle();
        // the serve has been answered: the line about it has done its work
        const live = net.game.state;
        if (serveTold && !live.serve && !live.dead && live.rally > 0) {
          serveTold = false;
          if (!quiet) say("");
        }
      }
      if (wire && now - lineAt > 1000 && lineRef.current && net.started) {
        lineAt = now;
        lineRef.current.textContent = lineSay(wire);
      }
      const fade = Math.pow(0.5, dt / SMOOTH_MS);
      off.bx *= fade;
      off.by *= fade;
      off.pad *= fade;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    draw(performance.now());
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      zone.removeEventListener("pointerdown", press);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", lift);
      window.removeEventListener("pointercancel", lift);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      view.dispose();
      link.close();
      if (table) labWatch(null);
    };
  }, [id, ids, me, room, self, solo]);

  const verdict =
    won === null ? null : won ? t("перемога твоя!", "you win!") : t(`перемога: ${rivalName}`, `${rivalName} wins`);
  return (
    <div className={`pong ping${tall ? " tall" : ""}`} data-point={point || undefined} data-won={won ?? undefined}>
      <PingHud rival={rivalName} winAt={WIN_AT} mine={tally[0]} theirs={tally[1]} match={point} />
      <ArcadeSay>{verdict ?? note ?? <span ref={sayRef} />}</ArcadeSay>
      <div className="ping-stage" ref={zoneRef}>
        <div className="arc-screen">
          <canvas
            ref={canvasRef}
            width={W * 3}
            height={H * 3}
            aria-label={t(
              "Пінг-понг: веди ракетку мишкою, пальцем або стрілками",
              "Ping-pong: move your paddle with the mouse, a finger or the arrow keys",
            )}
          />
          <span className="arc-line" ref={lineRef} />
          <div className="arc-pop" ref={popRef} aria-hidden />
        </div>
        {tall && (
          <div className="ping-rail" aria-hidden>
            <i ref={thumbRef} />
          </div>
        )}
      </div>
    </div>
  );
}
