"use client";

import { ChessBoard, Move, catchUp, cleanChess, newChess, play } from "./chess";
import { Duels } from "./useDuels";
import { Scores } from "./useScores";
import { Social } from "./useSocial";
import { TurnRules, Turns, useTurns } from "./useTurns";

export type Chess = Turns<ChessBoard, Move>;

const RULES: TurnRules<ChessBoard, Move> = {
  kind: "chess",
  event: "chess",
  start: newChess,
  clean: cleanChess,
  catchUp,
  play,
  timeUp: (b, out) => ({ ...b, winner: out === "x" ? "o" : "x", end: "time" }),
};

/** Chess on top of a duel, sent the way draughts is, on a clock when the invite set one. */
export function useChess(duels: Duels, social: Social, scores: Scores): Chess {
  return useTurns(RULES, duels, social, scores);
}
