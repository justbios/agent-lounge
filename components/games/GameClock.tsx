"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { Clock, LOW_MS, clockText, left } from "@/lib/live/clock";
import { Side } from "@/lib/live/duel";
import { boardSfx } from "@/lib/live/sounds/boards";

/** how often a running clock redraws: tenths show below ten seconds */
const TICK_MS = 100;

/**
 * One side's clock beside its seat. It lights up with a small jump when the move is handed to it and sinks when the
 * move is made; a bar under the digits drains with the time. In the last ten seconds it turns red and beats once a
 * second, and your own ticks softly with it; when the time is gone a flag drops on it.
 */
export default function GameClock({
  clock,
  side,
  turn,
  over,
  mine,
}: {
  clock: Clock;
  side: Side;
  turn: Side;
  over: boolean;
  mine?: boolean;
}) {
  const t = useTr();
  const running = !over && !clock.out && turn === side && clock.since >= 0;
  const [now, setNow] = useState(() => performance.now());
  // a clock already out when the board opens shows its flag down, without the fall
  const [opened] = useState(clock.out);
  const beat = useRef(-1);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const at = performance.now();
      setNow(at);
      const s = Math.ceil(left(clock, side, turn, over, at) / 1000);
      if (mine && s > 0 && s * 1000 <= LOW_MS && s !== beat.current) {
        beat.current = s;
        boardSfx.tick(s);
      }
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [running, clock, side, turn, over, mine]);
  const out = clock.out === side;
  const ms = out ? 0 : left(clock, side, turn, over, running ? Math.max(now, clock.since) : now);
  const low = ms < LOW_MS;
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const label = t(
    `на годиннику ${Math.floor(secs / 60)} хв ${secs % 60} с`,
    `${Math.floor(secs / 60)} min ${secs % 60} s on the clock`,
  );
  const state = out ? (opened ? " out" : " out fell") : running ? " on" : clock.spent.length && !over ? " rest" : "";
  return (
    <span className={`gclock${state}${low ? " low" : ""}`} role="timer" aria-label={label}>
      {/* a new second is a new beat: the digits jump with the tick */}
      <b key={running && low ? secs : "calm"}>{clockText(ms)}</b>
      <i style={{ "--left": Math.max(0, Math.min(1, ms / clock.limit)) } as CSSProperties} />
      {out && (
        <svg className="gclock-flag" viewBox="0 0 7 8" shapeRendering="crispEdges" aria-hidden>
          <rect x={1} y={0} width={1} height={8} fill="#07050d" />
          <rect x={2} y={0} width={4} height={4} fill="#ff5a5a" />
          <rect x={2} y={3} width={4} height={1} fill="#b8323a" />
          <rect x={6} y={1} width={1} height={2} fill="#ff5a5a" />
        </svg>
      )}
    </span>
  );
}

/** True once a clock ran out while the board was open: the board then stages the flag falling. */
export function useTimeUp(clock: Clock | null): boolean {
  const out = clock?.out ?? null;
  const [opened] = useState(out);
  return !!out && !opened;
}

/**
 * True while `side`'s clock is running in its last ten seconds, so the board itself can tighten. It flips at the very
 * moment the clock goes low, without redrawing the board every tick on the way there.
 */
export function useLowClock(clock: Clock | null, side: Side, turn: Side, over: boolean): boolean {
  const running = !!clock && !over && !clock.out && turn === side && clock.since >= 0;
  // the turn, by its start, in which the clock went low
  const [lowIn, setLowIn] = useState(-2);
  useEffect(() => {
    if (!clock || !running) return;
    const since = clock.since;
    const id = setTimeout(() => setLowIn(since), Math.max(0, left(clock, side, turn, over, performance.now()) - LOW_MS));
    return () => clearTimeout(id);
  }, [clock, running, side, turn, over]);
  return running && lowIn === clock?.since;
}
