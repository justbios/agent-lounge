import type { DuelKind, Match, Player } from "./duel";

/*
 * Solo play: a game for two against one of the café's own agents, played in this browser with nothing sent anywhere.
 * A match is a solo one when it carries `solo`; the agent sits in the other seat under a bot id. Everything here is
 * plain data and arithmetic, so the search worker can load it too.
 */

export type Level = "easy" | "normal" | "hard";
export const LEVELS: readonly Level[] = ["easy", "normal", "hard"];
export const isLevel = (v: unknown): v is Level => LEVELS.includes(v as Level);

export interface Solo {
  level: Level;
  /** every seat is played by a bot, this screen's own too: the lab's attract mode */
  auto?: boolean;
  /** the bots choose the same way every time, where that is practical */
  seed?: number;
  /** the bots of board games think this many times quicker: the lab's fast forward */
  speed?: number;
}

/** the games an agent can be played at */
export const SOLO_KINDS: readonly DuelKind[] = ["chess", "checkers", "hockey", "sumo", "four", "ttt", "pong"];
export type BoardKind = "ttt" | "four" | "checkers" | "chess";
export type LiveKind = "pong" | "hockey" | "sumo";

const BOT = "bot:";
/** The player id an agent sits at a board under; no person's id starts this way. */
export const botId = (key: string): string => `${BOT}${key}`.slice(0, 64);
export const isBot = (id: string): boolean => id.startsWith(BOT);
export const botPlayer = (key: string, name: string): Player => ({ id: botId(key), name: name.slice(0, 24) || "bot" });

/** Whether a bot plays `seat` (x, o) of this match on this screen. */
export function botSeat(m: Match, seat: Player): boolean {
  return !!m.solo && (isBot(seat.id) || !!m.solo.auto);
}

/** A string as a number, to seed with. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Numbers between 0 and 1 from a seed, the same in every browser. */
export function dice(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a match's bots are seeded with: the lab's seed, or the match itself, so each game goes its own way. */
export const soloSeed = (m: Pick<Match, "id" | "solo">): number => (m.solo?.seed ?? hashOf(m.id)) >>> 0;

/** how long an agent looks at a board before it moves, ms: never at once, longer in the thinking games */
const THINK: Record<BoardKind, [min: number, max: number]> = {
  ttt: [450, 900],
  four: [500, 1100],
  checkers: [550, 1300],
  chess: [600, 1500],
};

/** and never sooner than this, however early in the game */
const QUICKEST_MS = 400;

/**
 * How long the agent takes over this move. `chance` is a number between 0 and 1; `left` is the ms on its clock in a
 * game on one, so it never loses on time by dawdling.
 */
export function thinkMs(kind: BoardKind, chance: number, ply: number, left: number | null, speed = 1): number {
  const [lo, hi] = THINK[kind];
  // the first moves of a game come quicker, as a person plays an opening, but never at once
  const early = ply < 4 ? 0.6 : 1;
  let ms = Math.max(QUICKEST_MS, (lo + (hi - lo) * chance) * early);
  if (left !== null) ms = Math.min(ms, left / 40);
  return ms / Math.max(1, speed);
}

/** with less than this on its clock an agent stops looking deep, ms */
const HURRY_MS = 10000;

/** The level an agent searches at with `left` ms on its clock: short of time, hard plays quickly, as people do. */
export const levelAt = (level: Level, left: number | null): Level =>
  level === "hard" && left !== null && left < HURRY_MS ? "normal" : level;
