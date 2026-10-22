import { Match, Side, sideOf, str } from "./duel";

export const COLS = 7;
export const ROWS = 6;
const RUN = 4;

/** Four in a row: the cells row by row from the top, each move the column a disc was dropped into. */
export interface FourBoard {
  id: string;
  cells: (Side | null)[];
  turn: Side;
  winner: Side | "draw" | null;
  /** the cells of the winning row */
  line: number[] | null;
  /** the cell of the latest disc */
  last: number | null;
  moves: number[];
}

export const newFour = (id: string): FourBoard => ({
  id,
  cells: Array(COLS * ROWS).fill(null),
  turn: "x",
  winner: null,
  line: null,
  last: null,
  moves: [],
});

/** The cell a disc dropped into `col` lands in, or -1 when the column is full. */
export function landing(cells: readonly (Side | null)[], col: number): number {
  for (let row = ROWS - 1; row >= 0; row--) if (!cells[row * COLS + col]) return row * COLS + col;
  return -1;
}

/** Every disc of `mark` in a straight run through `cell`, if there are four or more of them. */
function runThrough(cells: readonly (Side | null)[], cell: number, mark: Side): number[] | null {
  const r0 = Math.floor(cell / COLS);
  const c0 = cell % COLS;
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const run = [cell];
    for (const k of [1, -1]) {
      let r = r0 + dr * k;
      let c = c0 + dc * k;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && cells[r * COLS + c] === mark) {
        run.push(r * COLS + c);
        r += dr * k;
        c += dc * k;
      }
    }
    if (run.length >= RUN) return run.sort((a, b) => a - b);
  }
  return null;
}

/** The board after the side to move drops a disc into `col`, or null when that column is full or the game is over. */
function drop(b: FourBoard, col: number): FourBoard | null {
  if (b.winner || !Number.isInteger(col) || col < 0 || col >= COLS) return null;
  const cell = landing(b.cells, col);
  if (cell < 0) return null;
  const mark = b.turn;
  const cells = b.cells.map((c, i) => (i === cell ? mark : c));
  const line = runThrough(cells, cell, mark);
  const winner = line ? mark : cells.every(Boolean) ? "draw" : null;
  return { ...b, cells, turn: mark === "x" ? "o" : "x", winner, line, last: cell, moves: [...b.moves, col] };
}

/** The board after `by` drops a disc into `col`, or null when that move is not theirs to make. */
export function play(m: Match, b: FourBoard, col: number, by: string): FourBoard | null {
  const mark = sideOf(m, by);
  if (!mark || m.gone || mark !== b.turn) return null;
  return drop(b, col);
}

/** The board after the moves the other side sent, when they start with the ones played here and add some. */
export function catchUp(b: FourBoard, moves: number[]): FourBoard | null {
  if (moves.length <= b.moves.length || !b.moves.every((m, i) => m === moves[i])) return null;
  let out: FourBoard | null = b;
  for (const col of moves.slice(b.moves.length)) out = out && drop(out, col);
  return out;
}

export function cleanFour(p: unknown): { game: string; by: string; moves: number[] } | null {
  const m = p as Record<string, unknown> | null;
  const game = str(m?.game, 64);
  const by = str(m?.by, 64);
  const moves = m?.moves;
  if (!game || !by || !Array.isArray(moves) || moves.length > COLS * ROWS) return null;
  const ok = moves.every((c) => Number.isInteger(c) && c >= 0 && c < COLS);
  return ok ? { game, by, moves } : null;
}
