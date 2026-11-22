"use client";

import { createContext, useContext } from "react";
import { Player, playersOf } from "@/lib/live/duel";
import { Level, botId, hashOf, isBot } from "@/lib/live/solo";
import { Look, lookFor } from "../../cafe/people";

/*
 * Who sits at a match: every player as the pixel person they are in the café, so the opening, the seats and the
 * result card all show the same faces. The frame around a match works it out once and hands it down.
 */

/** One of the café's own as the hall's picker draws it: enough to find an agent's face again at the board. */
export interface Face {
  key: string;
  name: string;
  color: string;
  look: Look;
}

/** A player at the board. */
export interface Sitter {
  id: string;
  name: string;
  /** this screen's own player */
  you: boolean;
  /** one of the café's agents */
  bot: boolean;
  look: Look;
  /** their colour: the agent's own in the café, a person's coat */
  color: string;
}

/** How a game ended for this screen's player. */
export type Outcome = "won" | "lost" | "drawn";

export interface Table {
  /** everyone at the board, this screen's own player first */
  sitters: Sitter[];
  /** how well the agent plays, in a game against one */
  level: Level | null;
  /** an agent is looking for its move */
  thinking: boolean;
  /** set once the game is over */
  outcome: Outcome | null;
}

/** the coats guests wear at the café's bar, and the sum the bar picks them by: a person looks the same at a board */
const COATS = ["#5aa9e6", "#f4a259", "#9b5de5", "#43aa8b", "#e5989b", "#c9b458"];
function barHash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** an agent the café no longer lists (or the lab's own) still gets a face: a robot in one of the house colours */
const SPARE = ["#62f0ff", "#ffc456", "#ff6aa8", "#8ee59b", "#b3a6cf"];

function sitterOf(p: Player, self: string, faces: readonly Face[]): Sitter {
  const bot = isBot(p.id);
  const base = { id: p.id, name: p.name, you: p.id === self, bot };
  if (bot) {
    const face = faces.find((f) => botId(f.key) === p.id);
    if (face) return { ...base, look: face.look, color: face.color };
    const h = hashOf(p.id);
    const color = SPARE[h % SPARE.length];
    return { ...base, look: lookFor(h, color, { kind: 1 }), color };
  }
  const h = barHash(p.id);
  const color = COATS[h % COATS.length];
  return { ...base, look: lookFor(h, color), color };
}

/** Everyone at a match as a sitter, this screen's own player first, the others in seat order. */
export function sittersOf(m: { x: Player; o: Player; z?: Player }, self: string, faces: readonly Face[]): Sitter[] {
  const all = playersOf(m).map((p) => sitterOf(p, self, faces));
  return [...all.filter((s) => s.you), ...all.filter((s) => !s.you)];
}

export const MatchTable = createContext<Table | null>(null);

/** The match this is drawn inside, or null outside one. */
export const useTable = (): Table | null => useContext(MatchTable);
