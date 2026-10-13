"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Match, sideOf } from "./duel";
import { TttBoard, cleanMove, newBoard, play } from "./ttt";
import { Duels } from "./useDuels";
import { Scores } from "./useScores";
import { Social } from "./useSocial";

export interface Ttt {
  match: Match | null;
  board: TttBoard | null;
  move: (cell: number) => void;
}

/** Noughts and crosses on top of a duel: the moves ride the social channel. */
export function useTicTacToe(duels: Duels, social: Social, scores: Scores): Ttt {
  const { bus, self, name } = social;
  const match = duels.match?.kind === "ttt" ? duels.match : null;
  const [saved, setSaved] = useState<TttBoard | null>(null);
  const recorded = useRef(new Set<string>());
  const board = match ? (saved?.id === match.id ? saved : newBoard(match.id)) : null;

  const onMove = useEffectEvent((p: unknown) => {
    const m = cleanMove(p);
    if (!m || !match || !board || m.game !== match.id) return;
    const next = play(match, board, m.cell, m.by);
    if (next) setSaved(next);
  });
  useEffect(() => bus.on("ttt", (p, mine) => !mine && onMove(p)), [bus]);

  const settle = useEffectEvent((m: Match, b: TttBoard) => {
    if (recorded.current.has(b.id)) return;
    recorded.current.add(b.id);
    scores.record(name, "ttt", b.winner === sideOf(m, self));
    duels.finish(m.id);
  });
  useEffect(() => {
    if (match && board?.winner) settle(match, board);
  }, [match, board]);

  const move = (cell: number) => {
    if (!match || !board) return;
    const next = play(match, board, cell, self);
    if (!next) return;
    setSaved(next);
    bus.send("ttt", { game: match.id, cell, by: self });
  };

  return { match, board, move };
}
