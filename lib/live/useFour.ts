"use client";

import { FourBoard, catchUp, cleanFour, newFour, play } from "./four";
import { Duels } from "./useDuels";
import { Scores } from "./useScores";
import { Social } from "./useSocial";
import { TurnRules, Turns, useTurns } from "./useTurns";

export type Four = Turns<FourBoard, number>;

const RULES: TurnRules<FourBoard, number> = {
  kind: "four",
  event: "four",
  start: newFour,
  clean: cleanFour,
  catchUp,
  play,
  timeUp: (b, out) => ({ ...b, winner: out === "x" ? "o" : "x" }),
};

/** Four in a row on top of a duel, each move the column a disc goes down. */
export function useFour(duels: Duels, social: Social, scores: Scores): Four {
  return useTurns(RULES, duels, social, scores);
}
