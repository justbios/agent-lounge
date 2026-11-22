"use client";

import { useEffect, useEffectEvent } from "react";
import type { BoardMove, Job } from "./bots/board";
import { quickMove, think } from "./bots/think";
import type { Match, Side } from "./duel";
import { BoardKind, botSeat, dice, levelAt, soloSeed, thinkMs } from "./solo";
import { setBotThinking } from "./soloStore";

/**
 * Plays an agent's moves in a solo match of a board game. When the side to move is an agent it asks the search for a
 * move, waits the rest of a believable pause, and makes it through `play`, the same way a person's move is made.
 * A move the rules will not take is swapped for a simple one, so a game never stalls on its agent.
 *
 * `left` is the ms on the mover's clock, or null in a game without one; `play` says whether the move was taken.
 */
export function useBot<B extends { turn: Side; winner: unknown }>(
  kind: BoardKind,
  match: Match | null,
  board: B | null,
  ply: number,
  left: () => number | null,
  play: (mv: BoardMove, by: string) => boolean,
) {
  const mover = match && board && !board.winner ? (board.turn === "x" ? match.x : match.o) : null;
  const due = !!match && !!mover && !match.gone && !match.over && botSeat(match, mover);

  // the move is made a moment after it is asked for: by the board as it stands then
  const make = useEffectEvent(play);
  const start = useEffectEvent(() => {
    const solo = match?.solo;
    if (!match || !board || !mover || !solo) return () => {};
    let live = true;
    let timer = 0;
    const began = performance.now();
    const seed = (soloSeed(match) ^ Math.imul(ply + 1, 0x9e3779b1)) >>> 0;
    const time = left();
    const wait = thinkMs(kind, dice(seed ^ 0x5bd1e995)(), ply, time, solo.speed);
    const job = { kind, board, level: levelAt(solo.level, time), seed } as unknown as Job;
    const by = mover.id;
    setBotThinking({ game: match.id, by, since: began });
    const go = (mv: BoardMove | null) => {
      if (!live) return;
      setBotThinking(null);
      if (mv !== null && make(mv, by)) return;
      const other = quickMove(job);
      if (other !== null) make(other, by);
    };
    void think(job).then((mv) => {
      if (live) timer = window.setTimeout(() => go(mv), Math.max(0, wait - (performance.now() - began)));
    });
    return () => {
      live = false;
      clearTimeout(timer);
      setBotThinking(null);
    };
  });

  const id = match?.id;
  useEffect(() => (due ? start() : undefined), [due, id, ply]);
}
