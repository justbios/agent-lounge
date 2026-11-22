import { DUEL_NAMES, DuelKind } from "@/lib/live/duel";

/*
 * What the hall remembers for next time, in this browser only: the machine last picked and the agent last played.
 * The level and the clock keep themselves (`soloStore`, `clock`).
 */

const GAME_KEY = "relay.hall.game";
const RIVAL_KEY = "relay.hall.rival";

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {}
};

/** The machine picked last time, or null on a first visit. */
export function recalledGame(): DuelKind | null {
  const v = read(GAME_KEY);
  return v && Object.hasOwn(DUEL_NAMES, v) ? (v as DuelKind) : null;
}

/** The agent played last time, as its key in the café. */
export const recalledRival = (): string | null => read(RIVAL_KEY);

export const recallGame = (game: DuelKind) => write(GAME_KEY, game);
export const recallRival = (key: string) => write(RIVAL_KEY, key);
