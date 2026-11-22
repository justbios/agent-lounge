import type { Side } from "@/lib/live/duel";

/*
 * What the two small board games share on their canvases: a little arithmetic, and what this browser remembers of
 * the game before, so that a new one can begin by clearing the old one away and the score of the sitting stays up.
 */

export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** how far along `from`…`from + dur` the time `now` is, 0 to 1 */
export const span = (now: number, from: number, dur: number) => clamp((now - from) / dur);
/** `v` moved towards `to` as it should be `dt` ms later, covering most of the way in `tau` ms */
export const ease = (v: number, to: number, dt: number, tau: number) => to + (v - to) * Math.exp(-dt / tau);

/** A number from 0 to 1 that is always the same for the same whole numbers. */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((c | 0) + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** A string as a whole number, to seed {@link hash} with. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h | 0;
}

/** The widths of the rows of a pixel disc `d` units across, top to bottom. */
export function discRows(d: number): number[] {
  const r = d / 2;
  return Array.from({ length: d }, (_, i) => 2 * Math.round(Math.sqrt(r * r - (i + 0.5 - r) ** 2)));
}

/** Whether the unit square (i, j) is inside a pixel disc whose rows are `rows` and whose corner is at (0, 0). */
export const inDisc = (rows: number[], i: number, j: number) =>
  j >= 0 && j < rows.length && i >= (rows.length - rows[j]) / 2 && i < (rows.length + rows[j]) / 2;

// ---- what is remembered between one game and the next, in this browser only -------------------------------------

/** how long the board of the game before is kept to be cleared away at the start of the next */
const KEEP_MS = 10 * 60 * 1000;

export interface Kept {
  /** the match it was */
  id: string;
  cells: (Side | null)[];
  /** the side the viewer played in it */
  mine: Side;
  at: number;
}

const boards = new Map<string, Kept>();
const series = new Map<string, Record<string, number>>();
const counted = new Set<string>();

/** Two players at one kind of game, whoever sits where. */
export const pairKey = (kind: string, a: string, b: string) => `${kind}:${[a, b].sort().join("|")}`;

/** Remembers how match `id` stands, for the game after it. */
export function keepBoard(pair: string, id: string, cells: (Side | null)[], mine: Side) {
  boards.set(pair, { id, cells, mine, at: Date.now() });
}

/** The game before `id`, as it was left, if these two played one a short while ago. */
export function boardBefore(pair: string, id: string): Kept | null {
  const k = boards.get(pair);
  return k && k.id !== id && Date.now() - k.at < KEEP_MS && k.cells.some(Boolean) ? k : null;
}

/** How this sitting stands between two players: games won by each player's id, and the drawn ones under "=". */
export const seriesOf = (pair: string): Record<string, number> => series.get(pair) ?? {};

/**
 * Counts match `id` for `winner` (a player's id, or "=" for a draw), once per match however often it is told;
 * true when this was the telling that counted.
 */
export function countGame(pair: string, id: string, winner: string): boolean {
  if (counted.has(id)) return false;
  counted.add(id);
  const s = series.get(pair) ?? {};
  series.set(pair, { ...s, [winner]: (s[winner] ?? 0) + 1 });
  return true;
}
