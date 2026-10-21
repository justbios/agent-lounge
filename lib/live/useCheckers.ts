"use client";

import { ChkBoard, catchUp, cleanChk, newChk, play } from "./checkers";
import { Duels } from "./useDuels";
import { Scores } from "./useScores";
import { Social } from "./useSocial";
import { TurnRules, Turns, useTurns } from "./useTurns";

export type Checkers = Turns<ChkBoard, number[]>;

const RULES: TurnRules<ChkBoard, number[]> = {
  kind: "checkers",
  event: "chk",
  start: newChk,
  clean: cleanChk,
  catchUp,
  play,
  timeUp: (b, out) => ({ ...b, winner: out === "x" ? "o" : "x" }),
};

/** Draughts on top of a duel, each move a path of squares, on a clock when the invite set one. */
export function useCheckers(duels: Duels, social: Social, scores: Scores): Checkers {
  return useTurns(RULES, duels, social, scores);
}
