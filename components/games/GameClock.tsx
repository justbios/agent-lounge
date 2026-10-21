"use client";

import { useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { Clock, LOW_MS, clockText, left } from "@/lib/live/clock";
import { Side } from "@/lib/live/duel";
import { sfx } from "@/lib/live/sfx";

/** how often a running clock redraws: tenths show below ten seconds */
const TICK_MS = 100;

/**
 * One side's clock beside its seat: lit while it runs, red in the last ten seconds, where your own also ticks once a
 * second.
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
  const beat = useRef(-1);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const at = performance.now();
      setNow(at);
      const s = Math.ceil(left(clock, side, turn, over, at) / 1000);
      if (mine && s > 0 && s * 1000 <= LOW_MS && s !== beat.current) {
        beat.current = s;
        sfx("tick");
      }
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [running, clock, side, turn, over, mine]);
  const ms = clock.out === side ? 0 : left(clock, side, turn, over, running ? Math.max(now, clock.since) : now);
  const low = ms < LOW_MS;
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const label = t(
    `на годиннику ${Math.floor(secs / 60)} хв ${secs % 60} с`,
    `${Math.floor(secs / 60)} min ${secs % 60} s on the clock`,
  );
  return (
    <span
      className={`gclock${running ? " on" : ""}${low ? " low" : ""}${clock.out === side ? " out" : ""}`}
      role="timer"
      aria-label={label}
    >
      {clockText(ms)}
    </span>
  );
}

/** True once a clock ran out while the board was open, which also sounds the game's end for it. */
export function useTimeUp(clock: Clock | null, mine: Side): boolean {
  const out = clock?.out ?? null;
  const [opened] = useState(out);
  const fresh = !!out && !opened;
  useEffect(() => {
    if (fresh) sfx(out === mine ? "lose" : "win");
  }, [fresh, out, mine]);
  return fresh;
}
