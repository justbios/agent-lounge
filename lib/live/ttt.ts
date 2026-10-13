export type Mark = "x" | "o";

export interface Player {
  id: string;
  name: string;
}

export interface TttGame {
  id: string;
  x: Player;
  o: Player;
  cells: (Mark | null)[];
  turn: Mark;
  winner: Mark | "draw" | null;
  line: number[] | null;
  /** the other player closed the game or left the café */
  gone: boolean;
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

export function newGame(id: string, x: Player, o: Player): TttGame {
  return { id, x, o, cells: Array(9).fill(null), turn: "x", winner: null, line: null, gone: false };
}

export const markOf = (g: TttGame, player: string): Mark | null => (g.x.id === player ? "x" : g.o.id === player ? "o" : null);

/** The game after `by` puts their mark in `cell`, or null when that move is not theirs to make. */
export function play(g: TttGame, cell: number, by: string): TttGame | null {
  const mark = markOf(g, by);
  if (!mark || g.winner || g.gone || mark !== g.turn) return null;
  if (!Number.isInteger(cell) || cell < 0 || cell > 8 || g.cells[cell]) return null;
  const cells = g.cells.map((c, i) => (i === cell ? mark : c));
  const line = LINES.find(([a, b, c]) => cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) ?? null;
  const winner = line ? mark : cells.every(Boolean) ? "draw" : null;
  return { ...g, cells, turn: mark === "x" ? "o" : "x", winner, line };
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

export function cleanPlayer(v: unknown): Player | null {
  const p = v as Partial<Player> | null;
  const id = str(p?.id, 64);
  const name = str(p?.name, 24);
  return id && name ? { id, name } : null;
}

export type TttMsg =
  | { t: "invite"; game: string; from: Player; to: string }
  | { t: "decline"; game: string; to: string }
  | { t: "accept"; game: string; x: Player; o: Player }
  | { t: "move"; game: string; cell: number; by: string }
  | { t: "leave"; game: string; by: string };

export function cleanTtt(p: unknown): TttMsg | null {
  const m = p as Record<string, unknown> | null;
  const game = str(m?.game, 64);
  if (!m || !game) return null;
  switch (m.t) {
    case "invite": {
      const from = cleanPlayer(m.from);
      const to = str(m.to, 64);
      return from && to ? { t: "invite", game, from, to } : null;
    }
    case "decline": {
      const to = str(m.to, 64);
      return to ? { t: "decline", game, to } : null;
    }
    case "accept": {
      const x = cleanPlayer(m.x);
      const o = cleanPlayer(m.o);
      return x && o ? { t: "accept", game, x, o } : null;
    }
    case "move": {
      const by = str(m.by, 64);
      return by && typeof m.cell === "number" ? { t: "move", game, cell: m.cell, by } : null;
    }
    case "leave": {
      const by = str(m.by, 64);
      return by ? { t: "leave", game, by } : null;
    }
  }
  return null;
}
