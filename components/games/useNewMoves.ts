"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { SfxName, sfx } from "@/lib/live/sfx";

/** Plays a sound a beat after the move's own, so the two are heard apart; `ms` defaults to 170. */
export type Soon = (name: SfxName, ms?: number) => void;

/**
 * Calls `play` for every move that comes in while the board is open, with the board as it stood before it; the moves
 * already made when it opened, and a new game starting over, stay quiet. Sounds `play` puts off with `soon` are
 * dropped if the board closes first.
 */
export function useNewMoves<B>(board: B, ply: number, play: (now: B, before: B, soon: Soon) => void) {
  const seen = useRef({ ply, board });
  const timers = useRef(new Set<number>());
  const onMove = useEffectEvent(play);
  useEffect(() => {
    const was = seen.current;
    seen.current = { ply, board };
    if (ply <= was.ply) return;
    const soon: Soon = (name, ms = 170) => {
      const id = window.setTimeout(() => {
        timers.current.delete(id);
        sfx(name);
      }, ms);
      timers.current.add(id);
    };
    onMove(board, was.board, soon);
  }, [ply, board]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
}
