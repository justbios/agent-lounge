import { Kind, N, Piece, VALUE, attacked, kindOf, owner } from "@/lib/live/chess";
import type { Side } from "@/lib/live/duel";

/*
 * What the chess board shows beyond the position itself: who is giving a check, along which squares, and what each
 * side has taken. It reads the rules' own answers and decides nothing.
 */

/** The squares of `by`'s pieces that attack `sq`. */
export function attackers(cells: Piece[], sq: number, by: Side): number[] {
  // each piece is asked alone: the rest of its side turn into the other side's pawns, which block a line all the same
  const blank: Piece = by === "x" ? "p" : "P";
  return cells.flatMap((p, s) => {
    if (owner(p) !== by) return [];
    const alone = cells.map((q, i) => (i !== s && owner(q) === by ? blank : q));
    return attacked(alone, sq, by) ? [s] : [];
  });
}

/** The squares strictly between two squares on one rank, file or diagonal; none for a knight's jump. */
export function between(a: number, b: number): number[] {
  const dr = Math.floor(b / N) - Math.floor(a / N);
  const dc = (b % N) - (a % N);
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return [];
  const step = Math.sign(dr) * N + Math.sign(dc);
  const out: number[] = [];
  for (let s = a + step; s !== b; s += step) out.push(s);
  return out;
}

export interface Took {
  kind: Kind;
  /** its place in the game's list of taken pieces */
  i: number;
  /** the first of its kind in the tray: a little gap goes before it */
  lead: boolean;
}

/** What a side has taken, the heaviest first and like beside like, the way a player lines them up by the board. */
export function trayOf(taken: Piece[], side: Side): Took[] {
  const got = taken
    .map((p, i) => ({ p, i }))
    .filter((x) => owner(x.p) !== side)
    .map((x) => ({ kind: kindOf(x.p), i: x.i }))
    .sort((a, b) => VALUE[b.kind] - VALUE[a.kind] || a.kind.localeCompare(b.kind) || a.i - b.i);
  return got.map((x, n) => ({ ...x, lead: n > 0 && got[n - 1].kind !== x.kind }));
}

/** how hard a piece lands or is hit, 1 for a pawn to 2 for a queen or a king */
export const heft = (k: Kind) => (k === "k" ? 2 : 1 + VALUE[k] / 9);
