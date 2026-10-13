import { Match, Side, sideOf, str } from "./duel";

export interface TttBoard {
  id: string;
  cells: (Side | null)[];
  turn: Side;
  winner: Side | "draw" | null;
  line: number[] | null;
}

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const newBoard = (id: string): TttBoard => ({ id, cells: Array(9).fill(null), turn: "x", winner: null, line: null });

/** The board after `by` puts their mark in `cell`, or null when that move is not theirs to make. */
export function play(m: Match, b: TttBoard, cell: number, by: string): TttBoard | null {
  const mark = sideOf(m, by);
  if (!mark || b.winner || m.gone || mark !== b.turn) return null;
  if (!Number.isInteger(cell) || cell < 0 || cell > 8 || b.cells[cell]) return null;
  const cells = b.cells.map((c, i) => (i === cell ? mark : c));
  const line = LINES.find(([p, q, r]) => cells[p] && cells[p] === cells[q] && cells[p] === cells[r]) ?? null;
  const winner = line ? mark : cells.every(Boolean) ? "draw" : null;
  return { ...b, cells, turn: mark === "x" ? "o" : "x", winner, line };
}

export function cleanMove(p: unknown): { game: string; cell: number; by: string } | null {
  const m = p as Record<string, unknown> | null;
  const game = str(m?.game, 64);
  const by = str(m?.by, 64);
  return game && by && typeof m?.cell === "number" ? { game, cell: m.cell, by } : null;
}
