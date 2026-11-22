import { ChessBoard, Move, Promo, apply, legal } from "../chess";
import type { Level } from "../solo";

/*
 * The agent's chess. The rules in ../chess keep a board as letters, which is right for a game played by two people
 * and far too slow to look ahead with, so the search has a board of its own in numbers: the same squares (a8 is 0,
 * h1 is 63), the same castling and en passant. It never decides what is allowed, though: the moves it may choose
 * from are the rules' own `legal`, its own list must come out exactly the same or it is not trusted (see
 * `chessMove`), and draws and mates at the root are the rules' `apply`.
 *
 * It counts material, where the pieces stand, passed pawns, and in a won ending drives the bare king to the edge;
 * captures are played out before a position is judged. Depth and a node budget set the level, never the clock, so a
 * seed plays the same game on any machine.
 */

const PAWN = 1;
const KNIGHT = 2;
const BISHOP = 3;
const ROOK = 4;
const QUEEN = 5;
const KING = 6;
const CODE: Record<string, number> = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6, p: -1, n: -2, b: -3, r: -4, q: -5, k: -6 };
const PROMO: Record<Promo, number> = { n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN };

const MATE = 1000000;
const WORTH = [0, 100, 320, 330, 500, 900, 0];
/** how much of a middlegame is left, by the pieces still on: a queen 4, a rook 2, a minor piece 1, out of 24 */
const PHASE = [0, 0, 1, 1, 2, 4, 0];

/* Where each piece likes to stand, from white's side with a8 first; black reads them upside down. */
// prettier-ignore
const AT_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];
// prettier-ignore
const AT_KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];
// prettier-ignore
const AT_BISHOP = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];
// prettier-ignore
const AT_ROOK = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
];
// prettier-ignore
const AT_QUEEN = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];
// prettier-ignore
const KING_MID = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
];
// prettier-ignore
const KING_END = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];
const PLACE = [[], AT_PAWN, AT_KNIGHT, AT_BISHOP, AT_ROOK, AT_QUEEN, KING_MID];
/** a pawn nothing can stop any more, by how many rows it has come */
const PASSED = [0, 5, 10, 20, 40, 70, 120, 0];

const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const hops = (sq: number, by: number[][]) =>
  by.flatMap(([dr, dc]) => (inside((sq >> 3) + dr, (sq & 7) + dc) ? [sq + dr * 8 + dc] : []));
const SQUARES = Array.from({ length: 64 }, (_, sq) => sq);
// prettier-ignore
const KNIGHT_TO = SQUARES.map((sq) => hops(sq, [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]));
// prettier-ignore
const KING_TO = SQUARES.map((sq) => hops(sq, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]));
/** from each square, the squares along each line: the four a rook goes, then the four a bishop goes */
// prettier-ignore
const RAYS = SQUARES.map((sq) =>
  [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dr, dc]) => {
    const out: number[] = [];
    for (let r = (sq >> 3) + dr, c = (sq & 7) + dc; inside(r, c); r += dr, c += dc) out.push(r * 8 + c);
    return out;
  }),
);
/** the castlings a move from or to a rook's corner leaves: white short 1, white long 2, black short 4, black long 8 */
const KEEPS = SQUARES.map((sq) => (sq === 63 ? ~1 : sq === 56 ? ~2 : sq === 7 ? ~4 : sq === 0 ? ~8 : ~0));

/* A move as one number: from, to << 6, what a pawn becomes << 12, and what kind of move << 15. */
const EN_PASSANT = 1 << 15;
const CASTLE = 2 << 15;
const DOUBLE = 4 << 15;
const fromOf = (m: number) => m & 63;
const toOf = (m: number) => (m >> 6) & 63;
const promoOf = (m: number) => (m >> 12) & 7;
/** a move without its kind, to match one of the rules' with */
const plain = (m: number) => m & 0x7fff;

/** The board the search plays on, moved on and taken back in place. */
class Pos {
  readonly sq = new Int8Array(64);
  white = true;
  castle = 0;
  ep = -1;
  kingW = -1;
  kingB = -1;
  private readonly caps = new Int8Array(256);
  private readonly castles = new Int8Array(256);
  private readonly eps = new Int8Array(256);
  private sp = 0;

  constructor(b: ChessBoard) {
    b.cells.forEach((p, i) => {
      this.sq[i] = p ? CODE[p] : 0;
      if (p === "K") this.kingW = i;
      if (p === "k") this.kingB = i;
    });
    this.white = b.turn === "x";
    this.castle =
      (b.castle.includes("K") ? 1 : 0) |
      (b.castle.includes("Q") ? 2 : 0) |
      (b.castle.includes("k") ? 4 : 0) |
      (b.castle.includes("q") ? 8 : 0);
    this.ep = b.ep;
  }

  /** whether a piece of white's (or black's) could take on `s` */
  attacked(s: number, byWhite: boolean): boolean {
    const sq = this.sq;
    const r = s >> 3;
    const c = s & 7;
    const pr = byWhite ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) {
      const pawn = byWhite ? PAWN : -PAWN;
      if (c > 0 && sq[pr * 8 + c - 1] === pawn) return true;
      if (c < 7 && sq[pr * 8 + c + 1] === pawn) return true;
    }
    const knight = byWhite ? KNIGHT : -KNIGHT;
    const kn = KNIGHT_TO[s];
    for (let i = 0; i < kn.length; i++) if (sq[kn[i]] === knight) return true;
    const king = byWhite ? KING : -KING;
    const kg = KING_TO[s];
    for (let i = 0; i < kg.length; i++) if (sq[kg[i]] === king) return true;
    const queen = byWhite ? QUEEN : -QUEEN;
    const rook = byWhite ? ROOK : -ROOK;
    const bishop = byWhite ? BISHOP : -BISHOP;
    const rays = RAYS[s];
    for (let d = 0; d < 8; d++) {
      const ray = rays[d];
      const line = d < 4 ? rook : bishop;
      for (let i = 0; i < ray.length; i++) {
        const v = sq[ray[i]];
        if (v === 0) continue;
        if (v === line || v === queen) return true;
        break;
      }
    }
    return false;
  }

  /** the side to move stands in check */
  inCheck(): boolean {
    return this.attacked(this.white ? this.kingW : this.kingB, !this.white);
  }

  /** the side that has just moved left its king to be taken: the move was not allowed */
  exposed(): boolean {
    return this.attacked(this.white ? this.kingB : this.kingW, this.white);
  }

  /**
   * Every move the pieces allow, before asking whether it leaves the king in check, written into `out`; the count is
   * returned. With `loud`, only the captures and the new queens.
   */
  gen(out: Int32Array, loud: boolean): number {
    const sq = this.sq;
    const white = this.white;
    let n = 0;
    for (let s = 0; s < 64; s++) {
      const p = sq[s];
      if (p === 0 || p > 0 !== white) continue;
      const kind = p > 0 ? p : -p;
      if (kind === PAWN) {
        const fwd = white ? -8 : 8;
        const r = s >> 3;
        const c = s & 7;
        const last = r === (white ? 1 : 6);
        const one = s + fwd;
        if (sq[one] === 0) {
          if (last) {
            out[n++] = s | (one << 6) | (QUEEN << 12);
            if (!loud) {
              out[n++] = s | (one << 6) | (ROOK << 12);
              out[n++] = s | (one << 6) | (BISHOP << 12);
              out[n++] = s | (one << 6) | (KNIGHT << 12);
            }
          } else if (!loud) {
            out[n++] = s | (one << 6);
            if (r === (white ? 6 : 1) && sq[one + fwd] === 0) out[n++] = s | ((one + fwd) << 6) | DOUBLE;
          }
        }
        for (let dc = -1; dc <= 1; dc += 2) {
          if (c + dc < 0 || c + dc > 7) continue;
          const t = one + dc;
          const v = sq[t];
          if (v !== 0 && v > 0 !== white) {
            if (last) {
              out[n++] = s | (t << 6) | (QUEEN << 12);
              if (!loud) {
                out[n++] = s | (t << 6) | (ROOK << 12);
                out[n++] = s | (t << 6) | (BISHOP << 12);
                out[n++] = s | (t << 6) | (KNIGHT << 12);
              }
            } else out[n++] = s | (t << 6);
          } else if (t === this.ep && v === 0) out[n++] = s | (t << 6) | EN_PASSANT;
        }
        continue;
      }
      if (kind === KNIGHT || kind === KING) {
        const to = kind === KNIGHT ? KNIGHT_TO[s] : KING_TO[s];
        for (let i = 0; i < to.length; i++) {
          const v = sq[to[i]];
          if (v === 0 ? !loud : v > 0 !== white) out[n++] = s | (to[i] << 6);
        }
        continue;
      }
      const rays = RAYS[s];
      const d0 = kind === BISHOP ? 4 : 0;
      const d1 = kind === ROOK ? 4 : 8;
      for (let d = d0; d < d1; d++) {
        const ray = rays[d];
        for (let i = 0; i < ray.length; i++) {
          const t = ray[i];
          const v = sq[t];
          if (v === 0) {
            if (!loud) out[n++] = s | (t << 6);
            continue;
          }
          if (v > 0 !== white) out[n++] = s | (t << 6);
          break;
        }
      }
    }
    if (loud) return n;
    const home = white ? 60 : 4;
    if (sq[home] === (white ? KING : -KING) && !this.attacked(home, !white)) {
      const rook = white ? ROOK : -ROOK;
      const short = white ? 1 : 4;
      const long = white ? 2 : 8;
      if (this.castle & short && sq[home + 3] === rook && sq[home + 1] === 0 && sq[home + 2] === 0) {
        if (!this.attacked(home + 1, !white)) out[n++] = home | ((home + 2) << 6) | CASTLE;
      }
      if (this.castle & long && sq[home - 4] === rook && sq[home - 1] === 0 && sq[home - 2] === 0) {
        if (sq[home - 3] === 0 && !this.attacked(home - 1, !white)) out[n++] = home | ((home - 2) << 6) | CASTLE;
      }
    }
    return n;
  }

  make(m: number) {
    const sq = this.sq;
    const from = fromOf(m);
    const to = toOf(m);
    const promo = promoOf(m);
    const white = this.white;
    const piece = sq[from];
    let cap = sq[to];
    if (m & EN_PASSANT) {
      const pawn = white ? to + 8 : to - 8;
      cap = sq[pawn];
      sq[pawn] = 0;
    }
    this.caps[this.sp] = cap;
    this.castles[this.sp] = this.castle;
    this.eps[this.sp] = this.ep;
    this.sp += 1;
    sq[from] = 0;
    sq[to] = promo ? (white ? promo : -promo) : piece;
    if (m & CASTLE) {
      if (to > from) {
        sq[from + 1] = sq[from + 3];
        sq[from + 3] = 0;
      } else {
        sq[from - 1] = sq[from - 4];
        sq[from - 4] = 0;
      }
    }
    if (piece === KING) {
      this.kingW = to;
      this.castle &= ~3;
    } else if (piece === -KING) {
      this.kingB = to;
      this.castle &= ~12;
    }
    this.castle &= KEEPS[from] & KEEPS[to];
    this.ep = m & DOUBLE ? (from + to) >> 1 : -1;
    this.white = !white;
  }

  unmake(m: number) {
    const sq = this.sq;
    const from = fromOf(m);
    const to = toOf(m);
    this.white = !this.white;
    const white = this.white;
    this.sp -= 1;
    const cap = this.caps[this.sp];
    this.castle = this.castles[this.sp];
    this.ep = this.eps[this.sp];
    const piece = promoOf(m) ? (white ? PAWN : -PAWN) : sq[to];
    sq[from] = piece;
    if (m & EN_PASSANT) {
      sq[to] = 0;
      sq[white ? to + 8 : to - 8] = cap;
    } else sq[to] = cap;
    if (m & CASTLE) {
      if (to > from) {
        sq[from + 3] = sq[from + 1];
        sq[from + 1] = 0;
      } else {
        sq[from - 4] = sq[from - 1];
        sq[from - 1] = 0;
      }
    }
    if (piece === KING) this.kingW = from;
    else if (piece === -KING) this.kingB = from;
  }

  /** the position as the side to move sees it, in hundredths of a pawn */
  weigh(): number {
    const sq = this.sq;
    let phase = 0;
    let mat = 0;
    let place = 0;
    let bishopsW = 0;
    let bishopsB = 0;
    let passed = 0;
    for (let s = 0; s < 64; s++) {
      const p = sq[s];
      if (p === 0 || p === KING || p === -KING) continue;
      if (p > 0) {
        phase += PHASE[p];
        mat += WORTH[p];
        place += PLACE[p][s];
        if (p === BISHOP) bishopsW += 1;
        else if (p === PAWN) {
          // passed: no pawn of the other side ahead of it on its file or the two beside
          const c = s & 7;
          let free = true;
          for (let t = s - 8; free && t >= 8; t -= 8) {
            if (sq[t] === -PAWN || (c > 0 && sq[t - 1] === -PAWN) || (c < 7 && sq[t + 1] === -PAWN)) free = false;
          }
          if (free) passed += PASSED[7 - (s >> 3)];
        }
      } else {
        phase += PHASE[-p];
        mat -= WORTH[-p];
        place -= PLACE[-p][s ^ 56];
        if (p === -BISHOP) bishopsB += 1;
        else if (p === -PAWN) {
          const c = s & 7;
          let free = true;
          for (let t = s + 8; free && t < 56; t += 8) {
            if (sq[t] === PAWN || (c > 0 && sq[t - 1] === PAWN) || (c < 7 && sq[t + 1] === PAWN)) free = false;
          }
          if (free) passed -= PASSED[s >> 3];
        }
      }
    }
    const mid = phase >= 24 ? 1 : phase / 24;
    let v = mat + place + passed * (1.4 - mid);
    if (bishopsW >= 2) v += 30;
    if (bishopsB >= 2) v -= 30;
    const kw = this.kingW;
    const kb = this.kingB;
    v += KING_MID[kw] * mid + KING_END[kw] * (1 - mid);
    v -= KING_MID[kb ^ 56] * mid + KING_END[kb ^ 56] * (1 - mid);
    // with a won ending in hand, drive the bare king to the edge and bring one's own king up to it
    if (mid < 0.4 && (mat >= 300 || mat <= -300)) {
      const lost = mat > 0 ? kb : kw;
      const r = lost >> 3;
      const c = lost & 7;
      const edge = Math.max(3 - r, r - 4) + Math.max(3 - c, c - 4);
      const apart = Math.abs((kw >> 3) - (kb >> 3)) + Math.abs((kw & 7) - (kb & 7));
      const push = (edge * 12 + (14 - apart) * 5) * (1 - mid);
      v += mat > 0 ? push : -push;
    }
    return this.white ? v : -v;
  }
}

/** as deep as a line is ever followed: the depth asked for, the checks it is extended by, the captures played out */
const MAX_PLY = 96;

class Search {
  nodes = 0;
  stopped = false;
  private readonly lists = Array.from({ length: MAX_PLY }, () => new Int32Array(256));
  private readonly ranks = Array.from({ length: MAX_PLY }, () => new Int32Array(256));
  private readonly killers = new Int32Array(MAX_PLY * 2);
  private readonly history = new Int32Array(64 * 64);

  constructor(
    readonly pos: Pos,
    readonly budget: number,
    readonly quietMax: number,
  ) {}

  /** the likeliest moves first: what takes the most with the least, a new queen, then what cut the search before */
  private rank(list: Int32Array, rank: Int32Array, n: number, ply: number) {
    const sq = this.pos.sq;
    const k0 = this.killers[ply * 2];
    const k1 = this.killers[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const m = list[i];
      const victim = sq[toOf(m)];
      const mover = sq[fromOf(m)];
      if (victim !== 0) rank[i] = 1000000 + WORTH[victim > 0 ? victim : -victim] * 10 - WORTH[mover > 0 ? mover : -mover];
      else if (m & EN_PASSANT) rank[i] = 1000000 + 900;
      else if (promoOf(m)) rank[i] = promoOf(m) === QUEEN ? 990000 : 100;
      else if (m === k0 || m === k1) rank[i] = 900000;
      else rank[i] = this.history[m & 4095];
    }
  }

  /** brings the best of the moves not yet tried to place `i` */
  private next(list: Int32Array, rank: Int32Array, i: number, n: number): number {
    let top = i;
    for (let j = i + 1; j < n; j++) if (rank[j] > rank[top]) top = j;
    if (top !== i) {
      const m = list[top];
      list[top] = list[i];
      list[i] = m;
      const r = rank[top];
      rank[top] = rank[i];
      rank[i] = r;
    }
    return list[i];
  }

  /** captures and new queens played out until the position is quiet, so nothing is judged mid-exchange */
  private settle(alpha: number, beta: number, left: number, ply: number): number {
    const pos = this.pos;
    const stand = pos.weigh();
    if (left <= 0 || stand >= beta || ply >= MAX_PLY - 1) return stand;
    if (stand > alpha) alpha = stand;
    const list = this.lists[ply];
    const rank = this.ranks[ply];
    const n = pos.gen(list, true);
    this.rank(list, rank, n, ply);
    let top = stand;
    for (let i = 0; i < n; i++) {
      const m = this.next(list, rank, i, n);
      pos.make(m);
      if (pos.exposed()) {
        pos.unmake(m);
        continue;
      }
      this.nodes += 1;
      const v = -this.settle(-beta, -alpha, left - 1, ply + 1);
      pos.unmake(m);
      if (v > top) top = v;
      if (top > alpha) alpha = top;
      if (alpha >= beta) break;
    }
    return top;
  }

  /** the best the side to move can get, looking `depth` half-moves ahead */
  best(depth: number, alpha: number, beta: number, ply: number): number {
    const pos = this.pos;
    const inCheck = pos.inCheck();
    // out of a check it looks one further, or a mate just past the horizon is missed
    if (inCheck && ply < 40) depth += 1;
    if (depth <= 0 || ply >= MAX_PLY - 12) return this.settle(alpha, beta, this.quietMax, ply);
    if (this.nodes > this.budget) {
      this.stopped = true;
      return pos.weigh();
    }
    const list = this.lists[ply];
    const rank = this.ranks[ply];
    const n = pos.gen(list, false);
    this.rank(list, rank, n, ply);
    let top = -Infinity;
    let any = false;
    for (let i = 0; i < n; i++) {
      const m = this.next(list, rank, i, n);
      const quiet = pos.sq[toOf(m)] === 0 && !(m & EN_PASSANT);
      pos.make(m);
      if (pos.exposed()) {
        pos.unmake(m);
        continue;
      }
      any = true;
      this.nodes += 1;
      const v = -this.best(depth - 1, -beta, -alpha, ply + 1);
      pos.unmake(m);
      if (this.stopped) return top === -Infinity ? v : top;
      if (v > top) top = v;
      if (top > alpha) alpha = top;
      if (alpha >= beta) {
        if (quiet) {
          if (this.killers[ply * 2] !== m) {
            this.killers[ply * 2 + 1] = this.killers[ply * 2];
            this.killers[ply * 2] = m;
          }
          this.history[m & 4095] += depth * depth;
        }
        break;
      }
    }
    if (!any) return inCheck ? -(MATE - ply) : 0;
    return top;
  }
}

/** The moves the search's own board allows, each with the same move as the rules write it. */
function ownMoves(pos: Pos): Map<number, number> {
  const list = new Int32Array(256);
  const n = pos.gen(list, false);
  const out = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    pos.make(list[i]);
    if (!pos.exposed()) out.set(plain(list[i]), list[i]);
    pos.unmake(list[i]);
  }
  return out;
}

const plainOf = (m: Move) => m[0] | (m[1] << 6) | ((m[2] ? PROMO[m[2]] : 0) << 12);

/** How many moves the search's own board finds `depth` half-moves on: the count a move maker is checked by. */
export function perft(b: ChessBoard, depth: number): number {
  const pos = new Pos(b);
  const lists = Array.from({ length: depth + 1 }, () => new Int32Array(256));
  const walk = (d: number): number => {
    const list = lists[d];
    const n = pos.gen(list, false);
    let count = 0;
    for (let i = 0; i < n; i++) {
      pos.make(list[i]);
      if (!pos.exposed()) count += d <= 1 ? 1 : walk(d - 1);
      pos.unmake(list[i]);
    }
    return count;
  };
  return depth <= 0 ? 1 : walk(depth);
}

/** The moves the search's own board allows in a position, as the rules write them: for checking it against them. */
export function ownLegal(b: ChessBoard): number[] {
  return [...ownMoves(new Pos(b)).keys()];
}

interface Skill {
  depth: number;
  /** positions looked at before the search stops going deeper */
  nodes: number;
  /** how many captures on end it plays out before judging */
  quiet: number;
  /** how far off its reading of a move can be, in hundredths of a pawn */
  noise: number;
  /** how often it just plays a move it may */
  slip: number;
}

const SKILL: Record<Level, Skill> = {
  easy: { depth: 1, nodes: 20000, quiet: 1, noise: 120, slip: 0.14 },
  normal: { depth: 2, nodes: 60000, quiet: 4, noise: 40, slip: 0.03 },
  hard: { depth: 16, nodes: 300000, quiet: 10, noise: 0, slip: 0 },
};
/** on hard the first moves get a little of it too, so that every game does not open the same way */
const OPENING_NOISE = 14;
const OPENING_PLIES = 8;

/**
 * The move an agent makes at chess. Easy looks one move ahead, misjudges freely and now and then plays anything;
 * normal looks two ahead and plays its captures out; hard goes as deep as its budget lets it, and deeper still once
 * few pieces are left.
 */
export function chessMove(b: ChessBoard, level: Level, rnd: () => number): Move | null {
  const moves = legal(b);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const any = () => moves[Math.floor(rnd() * moves.length) % moves.length];
  const skill = SKILL[level];
  if (rnd() < skill.slip) return any();
  const pos = new Pos(b);
  const own = ownMoves(pos);
  // the search's board must allow exactly what the rules do; if it ever did not, it would not be asked
  if (own.size !== moves.length || moves.some((m) => !own.has(plainOf(m)))) return any();
  const nexts = moves.map((m) => apply(b, m));
  const mate = nexts.findIndex((n) => n?.end === "mate");
  if (mate >= 0) return moves[mate];
  // a move the rules call a draw is one: stalemate, bare kings, the fiftieth quiet move, the third repetition;
  // and coming back to a position already seen is on its way to one
  const drawn = nexts.map((n) => !n || n.winner === "draw" || n.seen.filter((s) => s === n.seen.at(-1)).length > 1);
  // on hard it also sees a reply that repeats the position a third time: a move that lets the other side claim
  // the draw is worth no more than one
  const claimable =
    level === "hard" && b.seen.length >= 4
      ? nexts.map((n) => !!n && !n.winner && legal(n).some((r) => apply(n, r)?.end === "repeat"))
      : null;
  const noise = skill.noise || (b.moves.length < OPENING_PLIES ? OPENING_NOISE : 0);
  const search = new Search(pos, skill.nodes, skill.quiet);
  // a little shuffle first, so equal moves are not always answered the same way; captures still go first
  let order = moves
    .map((m, i) => ({ i, v: (b.cells[m[1]] ? -10 : 0) + rnd() }))
    .sort((p, q) => p.v - q.v)
    .map((o) => o.i);
  let scores = moves.map(() => 0);
  let lead = order[0];
  for (let depth = 1; depth <= skill.depth; depth++) {
    const round = moves.map(() => -Infinity);
    let alpha = -Infinity;
    let first = order[0];
    for (const i of order) {
      // below hard every move gets its true score, to add the misreading to; hard only needs the best one
      const floor = noise ? -Infinity : alpha;
      let v = 0;
      if (!drawn[i]) {
        const m = own.get(plainOf(moves[i]))!;
        pos.make(m);
        v = -search.best(depth - 1, -Infinity, -floor, 1);
        pos.unmake(m);
        if (claimable?.[i] && v > 0) v = 0;
      }
      if (search.stopped) break;
      round[i] = v;
      if (v > alpha) {
        alpha = v;
        first = i;
      }
    }
    // a search cut short keeps the last depth it finished
    if (search.stopped && depth > 1) break;
    scores = round;
    lead = first;
    order = [first, ...order.filter((i) => i !== first).sort((p, q) => round[q] - round[p])];
    if (search.stopped || alpha > MATE / 2) break;
  }
  if (!noise) return moves[lead];
  let pick = lead;
  let top = -Infinity;
  moves.forEach((_, i) => {
    if (scores[i] === -Infinity) return;
    const decided = Math.abs(scores[i]) > MATE / 2;
    const v = scores[i] + (decided ? 0 : (rnd() * 2 - 1) * noise);
    if (v > top) {
      top = v;
      pick = i;
    }
  });
  return moves[pick];
}
