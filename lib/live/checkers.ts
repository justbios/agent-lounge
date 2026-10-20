import { Match, Side, sideOf, str } from "./duel";

/** Empty, a man, or a king in capitals; x plays white from the bottom rows and moves first. */
export type Piece = "" | "x" | "X" | "o" | "O";

export interface ChkBoard {
  id: string;
  cells: Piece[];
  turn: Side;
  /** king moves in a row with nothing taken and no man moved; 30 of them is a draw */
  quiet: number;
  winner: Side | "draw" | null;
  /** every move so far, each the squares the piece stood on */
  moves: number[][];
  /** what the latest move took and where, so the board can show it a moment longer */
  took: { sq: number; p: Piece }[];
}

export const N = 8;
export const QUIET_DRAW = 30;
const DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export const dark = (sq: number) => (Math.floor(sq / N) + (sq % N)) % 2 === 1;
export const owner = (p: Piece): Side | null => (p ? (p.toLowerCase() as Side) : null);
export const isKing = (p: Piece) => p === "X" || p === "O";
const at = (r: number, c: number) => (r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1);
const lastRow = (s: Side) => (s === "x" ? 0 : N - 1);
const ahead = (s: Side) => (s === "x" ? -1 : 1);

export function newChk(id: string): ChkBoard {
  const cells: Piece[] = Array.from({ length: N * N }, (_, sq) => {
    const r = Math.floor(sq / N);
    return !dark(sq) ? "" : r < 3 ? "o" : r > 4 ? "x" : "";
  });
  return { id, cells, turn: "x", quiet: 0, winner: null, moves: [], took: [] };
}

/** Every way to go on taking from `sq`, as the squares landed on; the pieces taken stay on the board until the end. */
function jumps(cells: Piece[], sq: number, side: Side, king: boolean, taken: Set<number>): number[][] {
  const r = Math.floor(sq / N);
  const c = sq % N;
  const out: number[][] = [];
  const go = (land: number, victim: number) => {
    const crowned = king || Math.floor(land / N) === lastRow(side);
    const more = jumps(cells, land, side, crowned, new Set(taken).add(victim));
    return more.length ? more.map((m) => [land, ...m]) : [[land]];
  };
  for (const [dr, dc] of DIRS) {
    if (!king) {
      const mid = at(r + dr, c + dc);
      const land = at(r + 2 * dr, c + 2 * dc);
      if (land < 0 || cells[land] || taken.has(mid) || owner(cells[mid]) !== (side === "x" ? "o" : "x")) continue;
      out.push(...go(land, mid));
      continue;
    }
    let k = 1;
    while (at(r + k * dr, c + k * dc) >= 0 && !cells[at(r + k * dr, c + k * dc)]) k += 1;
    const victim = at(r + k * dr, c + k * dc);
    if (victim < 0 || taken.has(victim) || owner(cells[victim]) === side) continue;
    const lands: number[] = [];
    for (let j = k + 1; at(r + j * dr, c + j * dc) >= 0 && !cells[at(r + j * dr, c + j * dc)]; j++) {
      lands.push(at(r + j * dr, c + j * dc));
    }
    const ways = lands.map((l) => go(l, victim));
    const onward = ways.filter((w) => w.some((p) => p.length > 1));
    (onward.length ? onward : ways).forEach((w) => out.push(...w));
  }
  return out;
}

/** The moves the side to play may make: a capture whenever there is one, carried on while it can go on. */
export function legal(b: ChkBoard): number[][] {
  const caps: number[][] = [];
  const steps: number[][] = [];
  b.cells.forEach((p, sq) => {
    if (owner(p) !== b.turn) return;
    const king = isKing(p);
    const cells = b.cells.map((q, i) => (i === sq ? "" : q));
    jumps(cells, sq, b.turn, king, new Set()).forEach((j) => caps.push([sq, ...j]));
    if (caps.length) return;
    const r = Math.floor(sq / N);
    const c = sq % N;
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== ahead(b.turn)) continue;
      for (let k = 1; at(r + k * dr, c + k * dc) >= 0 && !b.cells[at(r + k * dr, c + k * dc)]; k++) {
        steps.push([sq, at(r + k * dr, c + k * dc)]);
        if (!king) break;
      }
    }
  });
  return caps.length ? caps : steps;
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

function between(a: number, b: number): number[] {
  const dr = Math.sign(Math.floor(b / N) - Math.floor(a / N));
  const dc = Math.sign((b % N) - (a % N));
  const out: number[] = [];
  for (let s = a + dr * N + dc; s !== b; s += dr * N + dc) out.push(s);
  return out;
}

/** The board after a move the side to play may make, or null when it is not one. */
export function apply(b: ChkBoard, path: number[]): ChkBoard | null {
  if (b.winner || !legal(b).some((m) => same(m, path))) return null;
  const cells = [...b.cells];
  const piece = cells[path[0]];
  const took: ChkBoard["took"] = [];
  let crowned = isKing(piece);
  for (let i = 1; i < path.length; i++) {
    for (const s of between(path[i - 1], path[i])) {
      if (cells[s]) took.push({ sq: s, p: cells[s] });
      cells[s] = "";
    }
    if (Math.floor(path[i] / N) === lastRow(b.turn)) crowned = true;
  }
  cells[path[0]] = "";
  cells[path.at(-1)!] = (crowned ? b.turn.toUpperCase() : b.turn) as Piece;
  const quiet = !took.length && isKing(piece) ? b.quiet + 1 : 0;
  const turn: Side = b.turn === "x" ? "o" : "x";
  const next: ChkBoard = { ...b, cells, turn, quiet, moves: [...b.moves, path], took };
  const winner = !legal(next).length ? b.turn : quiet >= QUIET_DRAW ? "draw" : null;
  return { ...next, winner };
}

/** The board after `by` makes a move, or null when the move is not theirs to make. */
export function play(m: Match, b: ChkBoard, path: number[], by: string): ChkBoard | null {
  return sideOf(m, by) === b.turn && !m.gone ? apply(b, path) : null;
}

/**
 * Catches a board up with the moves the other side sent: the whole game so far, so a lost message costs nothing. It
 * must begin with every move this side already knows.
 */
export function catchUp(b: ChkBoard, moves: number[][]): ChkBoard | null {
  if (moves.length <= b.moves.length || !b.moves.every((m, i) => same(m, moves[i]))) return null;
  let out: ChkBoard | null = b;
  for (const path of moves.slice(b.moves.length)) {
    out = out && apply(out, path);
  }
  return out;
}

const square = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < N * N;

export function cleanChk(p: unknown): { game: string; by: string; moves: number[][] } | null {
  const m = p as Record<string, unknown> | null;
  const game = str(m?.game, 64);
  const by = str(m?.by, 64);
  const moves = m?.moves;
  if (!game || !by || !Array.isArray(moves) || moves.length > 600) return null;
  const ok = moves.every((x) => Array.isArray(x) && x.length >= 2 && x.length <= 13 && x.every(square));
  return ok ? { game, by, moves: moves as number[][] } : null;
}
