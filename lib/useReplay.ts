"use client";

import { useEffect, useRef, useState } from "react";

export interface Replay {
  clock: number;
  cycle: number;
  playing: boolean;
  speed: number;
  setPlaying: (v: boolean) => void;
  setSpeed: (v: number) => void;
  restart: () => void;
}

/**
 * requestAnimationFrame-driven clock that replays a run of length `totalMs`.
 * Loops by default, bumping `cycle` each time it wraps.
 */
export function useReplay(totalMs: number, loop = true): Replay {
  const [clock, setClock] = useState(0);
  const [cycle, setCycle] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const clockRef = useRef(0);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      if (lastRef.current == null) lastRef.current = now;
      const dt = now - lastRef.current;
      lastRef.current = now;
      if (playingRef.current) {
        let next = clockRef.current + dt * speedRef.current;
        if (next >= totalMs) {
          if (loop) {
            next %= totalMs;
            setCycle((c) => c + 1);
          } else {
            next = totalMs;
            setPlaying(false);
          }
        }
        clockRef.current = next;
        setClock(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [totalMs, loop]);

  const restart = () => {
    clockRef.current = 0;
    lastRef.current = null;
    setClock(0);
    setCycle(1);
    setPlaying(true);
  };

  return { clock, cycle, playing, speed, setPlaying, setSpeed, restart };
}
