import { Match, Side, sideOf, str } from "./duel";

/** Empty, or a piece: white (x, whoever invited, moves first) in capitals, black (o) in lower case. */
export type Piece = "" | "K" | "Q" | "R" | "B" | "N" | "P" | "k" | "q" | "r" | "b" | "n" | "p";
export type Kind = "k" | "q" | "r" | "b" | "n" | "p";
/** what a pawn turns into on the last rank */
export type Promo = "q" | "r" | "b" | "n";
/** from, to, and the promotion when a pawn reaches the last rank */
export type Move = [from: number, to: number, promo?: Promo];
/** checkmate, stalemate, fifty quiet moves, too little left to mate, or the same position three times */
export type End = "mate" | "stalemate" | "fifty" | "material" | "repeat";

export interface ChessBoard {
  id: string;
  /** a8 first and h1 last, the way a diagram is printed: white starts on the two bottom rows */
  cells: Piece[];
  turn: Side;
  /** the castlings still allowed, out of "KQkq" */
  castle: string;
  /** the square a pawn has just skipped with a double step, where it can be taken en passant; -1 when none */
  ep: number;
  /** half-moves with nothing taken and no pawn moved; 100 of them is a draw */
  quiet: number;
  winner: Side | "draw" | null;
  end: End | null;
  /** every move so far */
  moves: Move[];
  /** the same moves in algebraic notation: "e4", "Nxf3+", "O-O", "e8=Q#" */
  san: string[];
  /** every piece taken so far, in order */
  taken: Piece[];
  /** the positions since the last capture or pawn move, for the threefold repetition */
  seen: string[];
}

export const N = 8;
export const FIFTY = 100;
export const PROMOS: readonly Promo[] = ["q", "r", "b", "n"];
/** the usual worth of each piece, for the material count beside the board */
export const VALUE: Record<Kind, number> = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 };

const KNIGHT = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
const ROOK = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const BISHOP = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const KING = [...ROOK, ...BISHOP];
const BACK = "rnbqkbnr";
/** the rook corners, and the castling each one keeps alive */
const CORNER: Record<number, string> = { 0: "q", 7: "k", 56: "Q", 63: "K" };

export const owner = (p: Piece): Side | null => (!p ? null : p === p.toUpperCase() ? "x" : "o");
export const kindOf = (p: Piece) => p.toLowerCase() as Kind;
export const light = (sq: number) => (Math.floor(sq / N) + (sq % N)) % 2 === 0;
export const file = (sq: number) => "abcdefgh"[sq % N];
export const rank = (sq: number) => String(N - Math.floor(sq / N));
export const sqName = (sq: number) => file(sq) + rank(sq);
const at = (r: number, c: number) => (r >= 0 && r < N && c >= 0 && c < N ? r * N + c : -1);
const other = (s: Side): Side => (s === "x" ? "o" : "x");
const as = (s: Side, k: Kind) => (s === "x" ? k.toUpperCase() : k) as Piece;
const same = (a: Move, b: Move) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** A position as text: the pieces, who moves, the castlings left, and an en passant square when it can be used. */
function key(b: Pick<ChessBoard, "cells" | "turn" | "castle" | "ep">): string {
  const pawn = as(b.turn, "p");
  const r = Math.floor(b.ep / N) - (b.turn === "x" ? -1 : 1);
  const ep = b.ep >= 0 && [-1, 1].some((dc) => b.cells[at(r, (b.ep % N) + dc)] === pawn) ? b.ep : -1;
  return `${b.cells.map((p) => p || ".").join("")}${b.turn}${b.castle}${ep}`;
}

export function newChess(id: string): ChessBoard {
  const cells = Array.from({ length: N * N }, (_, sq) => {
    const r = Math.floor(sq / N);
    const back = BACK[sq % N];
    return r === 0 ? back : r === 1 ? "p" : r === 6 ? "P" : r === 7 ? back.toUpperCase() : "";
  }) as Piece[];
  const b = { cells, turn: "x" as Side, castle: "KQkq", ep: -1 };
  return { id, ...b, quiet: 0, winner: null, end: null, moves: [], san: [], taken: [], seen: [key(b)] };
}

/** Whether a piece of `by` could take on `sq`. */
export function attacked(cells: Piece[], sq: number, by: Side): boolean {
  const r = Math.floor(sq / N);
  const c = sq % N;
  const pr = by === "x" ? r + 1 : r - 1;
  if ([-1, 1].some((dc) => cells[at(pr, c + dc)] === as(by, "p"))) return true;
  if (KNIGHT.some(([dr, dc]) => cells[at(r + dr, c + dc)] === as(by, "n"))) return true;
  if (KING.some(([dr, dc]) => cells[at(r + dr, c + dc)] === as(by, "k"))) return true;
  const ray = (dirs: number[][], piece: Kind) =>
    dirs.some(([dr, dc]) => {
      for (let k = 1; ; k++) {
        const s = at(r + k * dr, c + k * dc);
        if (s < 0) return false;
        if (cells[s]) return cells[s] === as(by, piece) || cells[s] === as(by, "q");
      }
    });
  return ray(ROOK, "r") || ray(BISHOP, "b");
}

/** The square of the king of the side to move when it stands in check, else -1. */
export function checked(b: Pick<ChessBoard, "cells" | "turn">): number {
  const k = b.cells.indexOf(as(b.turn, "k"));
  return k >= 0 && attacked(b.cells, k, other(b.turn)) ? k : -1;
}

/** Every move the pieces allow, before asking whether it leaves the king in check. */
function pseudo(b: ChessBoard): Move[] {
  const out: Move[] = [];
  const side = b.turn;
  const cells = b.cells;
  const fwd = side === "x" ? -1 : 1;
  const free = (s: number) => s >= 0 && !cells[s];
  const foe = (s: number) => s >= 0 && owner(cells[s]) === other(side);
  cells.forEach((p, sq) => {
    if (owner(p) !== side) return;
    const r = Math.floor(sq / N);
    const c = sq % N;
    const kind = kindOf(p);
    if (kind === "p") {
      const add = (to: number) => {
        if (Math.floor(to / N) === (side === "x" ? 0 : N - 1)) PROMOS.forEach((q) => out.push([sq, to, q]));
        else out.push([sq, to]);
      };
      const one = at(r + fwd, c);
      if (free(one)) {
        add(one);
        const two = at(r + 2 * fwd, c);
        if (r === (side === "x" ? 6 : 1) && free(two)) add(two);
      }
      for (const dc of [-1, 1]) {
        const s = at(r + fwd, c + dc);
        if (foe(s) || (s >= 0 && s === b.ep)) add(s);
      }
      return;
    }
    if (kind === "n" || kind === "k") {
      for (const [dr, dc] of kind === "n" ? KNIGHT : KING) {
        const s = at(r + dr, c + dc);
        if (free(s) || foe(s)) out.push([sq, s]);
      }
      return;
    }
    for (const [dr, dc] of kind === "r" ? ROOK : kind === "b" ? BISHOP : KING) {
      for (let k = 1; ; k++) {
        const s = at(r + k * dr, c + k * dc);
        if (s < 0) break;
        if (cells[s]) {
          if (foe(s)) out.push([sq, s]);
          break;
        }
        out.push([sq, s]);
      }
    }
  });
  const home = side === "x" ? 60 : 4;
  const enemy = other(side);
  if (cells[home] === as(side, "k") && !attacked(cells, home, enemy)) {
    const [short, long] = side === "x" ? ["K", "Q"] : ["k", "q"];
    const rook = as(side, "r");
    if (b.castle.includes(short) && cells[home + 3] === rook && free(home + 1) && free(home + 2)) {
      if (!attacked(cells, home + 1, enemy)) out.push([home, home + 2]);
    }
    if (b.castle.includes(long) && cells[home - 4] === rook && free(home - 1) && free(home - 2) && free(home - 3)) {
      if (!attacked(cells, home - 1, enemy)) out.push([home, home - 2]);
    }
  }
  return out;
}

/** The pieces after a move, and what it took: en passant takes the pawn beside, castling brings the rook along. */
function shift(b: ChessBoard, [from, to, promo]: Move): { cells: Piece[]; took: Piece } {
  const cells = [...b.cells];
  const p = cells[from];
  let took = cells[to];
  if (kindOf(p) === "p" && to === b.ep) {
    const pawn = to + (b.turn === "x" ? N : -N);
    took = cells[pawn];
    cells[pawn] = "";
  }
  if (kindOf(p) === "k" && Math.abs(to - from) === 2) {
    const rook = to > from ? from + 3 : from - 4;
    cells[(from + to) / 2] = cells[rook];
    cells[rook] = "";
  }
  cells[to] = promo ? as(b.turn, promo) : p;
  cells[from] = "";
  return { cells, took };
}

const known = new WeakMap<ChessBoard, Move[]>();

/** The moves the side to play may make: none once the game is over. */
export function legal(b: ChessBoard): Move[] {
  if (b.winner) return [];
  const hit = known.get(b);
  if (hit) return hit;
  const out = pseudo(b).filter((m) => {
    const { cells } = shift(b, m);
    return checked({ cells, turn: b.turn }) < 0;
  });
  known.set(b, out);
  return out;
}

/** Nothing left that could ever mate: bare kings, one minor piece, or bishops all on squares of one colour. */
function bare(cells: Piece[]): boolean {
  const rest = cells.flatMap((p, sq) => (p && kindOf(p) !== "k" ? [{ kind: kindOf(p), sq }] : []));
  if (rest.length <= 1) return rest.every((x) => x.kind === "b" || x.kind === "n");
  return rest.every((x) => x.kind === "b") && new Set(rest.map((x) => light(x.sq))).size === 1;
}

function notation(b: ChessBoard, m: Move, moves: Move[], took: Piece, check: boolean, mate: boolean): string {
  const p = b.cells[m[0]];
  const kind = kindOf(p);
  let s: string;
  if (kind === "k" && Math.abs(m[1] - m[0]) === 2) s = m[1] > m[0] ? "O-O" : "O-O-O";
  else if (kind === "p") s = `${took ? `${file(m[0])}x` : ""}${sqName(m[1])}${m[2] ? `=${m[2].toUpperCase()}` : ""}`;
  else {
    const rivals = moves.filter((x) => x[1] === m[1] && x[0] !== m[0] && b.cells[x[0]] === p).map((x) => x[0]);
    let from = "";
    if (rivals.length) {
      if (!rivals.some((sq) => sq % N === m[0] % N)) from = file(m[0]);
      else if (!rivals.some((sq) => rank(sq) === rank(m[0]))) from = rank(m[0]);
      else from = sqName(m[0]);
    }
    s = `${kind.toUpperCase()}${from}${took ? "x" : ""}${sqName(m[1])}`;
  }
  return s + (mate ? "#" : check ? "+" : "");
}

/** The board after a move the side to play may make, or null when it is not one. */
export function apply(b: ChessBoard, mv: Move): ChessBoard | null {
  const moves = legal(b);
  const m = moves.find((x) => same(x, mv));
  if (!m) return null;
  const p = b.cells[m[0]];
  const side = b.turn;
  const { cells, took } = shift(b, m);
  let castle = b.castle;
  if (kindOf(p) === "k") castle = castle.replace(side === "x" ? /[KQ]/g : /[kq]/g, "");
  for (const sq of [m[0], m[1]]) if (CORNER[sq]) castle = castle.replace(CORNER[sq], "");
  const pawn = kindOf(p) === "p";
  const ep = pawn && Math.abs(m[1] - m[0]) === 2 * N ? (m[0] + m[1]) / 2 : -1;
  const turn = other(side);
  const now = key({ cells, turn, castle, ep });
  const seen = pawn || took ? [now] : [...b.seen, now];
  const next: ChessBoard = {
    ...b,
    cells,
    turn,
    castle,
    ep,
    quiet: pawn || took ? 0 : b.quiet + 1,
    moves: [...b.moves, m],
    taken: took ? [...b.taken, took] : b.taken,
    seen,
  };
  const replies = legal(next);
  const check = checked(next) >= 0;
  const end: End | null = !replies.length
    ? check
      ? "mate"
      : "stalemate"
    : bare(cells)
      ? "material"
      : next.quiet >= FIFTY
        ? "fifty"
        : seen.filter((s) => s === now).length >= 3
          ? "repeat"
          : null;
  const winner = end === "mate" ? side : end ? "draw" : null;
  const out: ChessBoard = { ...next, winner, end, san: [...b.san, notation(b, m, moves, took, check, end === "mate")] };
  if (!winner) known.set(out, replies);
  return out;
}

/** The board after `by` makes a move, or null when the move is not theirs to make. */
export function play(m: Match, b: ChessBoard, mv: Move, by: string): ChessBoard | null {
  return sideOf(m, by) === b.turn && !m.gone ? apply(b, mv) : null;
}

/**
 * Catches a board up with the moves the other side sent: the whole game so far, so a lost message costs nothing. It
 * must begin with every move this side already knows.
 */
export function catchUp(b: ChessBoard, moves: Move[]): ChessBoard | null {
  if (moves.length <= b.moves.length || !b.moves.every((m, i) => same(m, moves[i]))) return null;
  let out: ChessBoard | null = b;
  for (const mv of moves.slice(b.moves.length)) {
    out = out && apply(out, mv);
  }
  return out;
}

const square = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < N * N;

/** One move off the wire; JSON may carry a missing promotion as null. */
function cleanMove(v: unknown): Move | null {
  if (!Array.isArray(v) || v.length < 2 || v.length > 3 || !square(v[0]) || !square(v[1])) return null;
  if (v[2] == null) return [v[0], v[1]];
  return PROMOS.includes(v[2]) ? [v[0], v[1], v[2]] : null;
}

export function cleanChess(p: unknown): { game: string; by: string; moves: Move[] } | null {
  const m = p as Record<string, unknown> | null;
  const game = str(m?.game, 64);
  const by = str(m?.by, 64);
  const raw = m?.moves;
  if (!game || !by || !Array.isArray(raw) || raw.length > 1000) return null;
  const moves = raw.map(cleanMove);
  return moves.every((x) => x !== null) ? { game, by, moves: moves as Move[] } : null;
}
