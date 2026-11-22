import { ChkBoard, N, Piece, QUIET_DRAW, isKing, legal, owner } from "../checkers";
import type { Side } from "../duel";
import type { Level } from "../solo";

const WIN = 1000000;
const MAN = 100;
/** a king flies the whole diagonal here, so it is worth about three men */
const KING = 310;

interface Skill {
  depth: number;
  /** positions looked at before the search stops going deeper */
  nodes: number;
  /** how far off its reading of a move can be, in hundredths of a man */
  noise: number;
  /** how often it just plays a move it may */
  slip: number;
}

const SKILL: Record<Level, Skill> = {
  easy: { depth: 1, nodes: 2000, noise: 70, slip: 0.2 },
  normal: { depth: 3, nodes: 8000, noise: 22, slip: 0.05 },
  hard: { depth: 14, nodes: 80000, noise: 0, slip: 0 },
};

const other = (s: Side): Side => (s === "x" ? "o" : "x");
const lastRow = (s: Side) => (s === "x" ? 0 : N - 1);

interface Step {
  cells: Piece[];
  took: number;
  /** a king moved and nothing was taken: thirty of these in a row is a draw */
  quiet: boolean;
}

/** The pieces after a move that `legal` gave: what stands between two squares of the path is taken. */
function shift(cells: Piece[], turn: Side, path: number[]): Step {
  const out = [...cells];
  const piece = out[path[0]];
  let took = 0;
  let crowned = isKing(piece);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dr = Math.sign(Math.floor(b / N) - Math.floor(a / N));
    const dc = Math.sign((b % N) - (a % N));
    for (let s = a + dr * N + dc; s !== b; s += dr * N + dc) {
      if (out[s]) took += 1;
      out[s] = "";
    }
    if (Math.floor(b / N) === lastRow(turn)) crowned = true;
  }
  out[path[0]] = "";
  out[path[path.length - 1]] = (crowned ? turn.toUpperCase() : turn) as Piece;
  return { cells: out, took, quiet: !took && isKing(piece) };
}

/** The board as `side` sees it: men and kings, how far the men have got, the middle, and the back row kept. */
function weigh(cells: Piece[], side: Side): number {
  let v = 0;
  let count = 0;
  let mine = 0;
  let theirs = 0;
  for (let sq = 0; sq < N * N; sq++) {
    const p = cells[sq];
    if (!p) continue;
    count += 1;
    const who = owner(p)!;
    const r = Math.floor(sq / N);
    const c = sq % N;
    let w: number;
    if (isKing(p)) {
      // the long diagonal is where a king sees the most
      w = KING + (r + c === N - 1 ? 14 : 0);
    } else {
      const gone = who === "x" ? N - 1 - r : r;
      const home = gone === 0 ? 7 : 0;
      const mid = c >= 2 && c <= 5 ? 3 : 0;
      const edge = c === 0 || c === N - 1 ? -2 : 0;
      w = MAN + gone * 4 + (gone >= 5 ? 10 : 0) + home + mid + edge;
    }
    if (who === side) {
      v += w;
      mine += 1;
    } else {
      v -= w;
      theirs += 1;
    }
  }
  // ahead in pieces, it is glad to trade down; behind, it is not
  if (mine !== theirs) v += (mine > theirs ? 1 : -1) * (24 - count) * 3;
  return v;
}

const DIRS = [-1, -1, -1, 1, 1, -1, 1, 1];

/**
 * Whether the side to move has a capture, read straight off the squares: much cheaper than listing the moves, and
 * most positions a search ends on have none. Only a hint: the moves themselves always come from the rules.
 */
function canTake(cells: Piece[], turn: Side): boolean {
  const man = turn;
  const king = turn.toUpperCase();
  for (let sq = 0; sq < N * N; sq++) {
    const p = cells[sq];
    if (p !== man && p !== king) continue;
    const r = (sq / N) | 0;
    const c = sq % N;
    for (let d = 0; d < 8; d += 2) {
      const dr = DIRS[d];
      const dc = DIRS[d + 1];
      let rr = r + dr;
      let cc = c + dc;
      if (p === king) {
        while (rr >= 0 && rr < N && cc >= 0 && cc < N && !cells[rr * N + cc]) {
          rr += dr;
          cc += dc;
        }
      }
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
      const v = cells[rr * N + cc];
      if (!v || v === man || v === king) continue;
      const lr = rr + dr;
      const lc = cc + dc;
      if (lr >= 0 && lr < N && lc >= 0 && lc < N && !cells[lr * N + lc]) return true;
    }
  }
  return false;
}

class Search {
  nodes = 0;
  stopped = false;
  constructor(readonly budget: number) {}

  /** the best `turn` can get, looking `depth` moves ahead; a capture that must be made is always played out */
  best(cells: Piece[], turn: Side, depth: number, alpha: number, beta: number, ply: number, quiet: number): number {
    if (quiet >= QUIET_DRAW) return 0;
    if (depth <= 0 && !canTake(cells, turn)) return weigh(cells, turn);
    const moves = legal({ cells, turn });
    if (!moves.length) return -(WIN - ply);
    const steps = moves.map((m) => shift(cells, turn, m));
    const taking = steps[0].took > 0;
    if (depth <= 0 && !taking) return weigh(cells, turn);
    if (this.nodes > this.budget) {
      this.stopped = true;
      return weigh(cells, turn);
    }
    const order = steps.map((_, i) => i);
    if (taking) order.sort((a, b) => steps[b].took - steps[a].took);
    let top = -Infinity;
    for (const i of order) {
      this.nodes += 1;
      const s = steps[i];
      const v = -this.best(s.cells, other(turn), depth - 1, -beta, -alpha, ply + 1, s.quiet ? quiet + 1 : 0);
      if (v > top) top = v;
      if (top > alpha) alpha = top;
      if (alpha >= beta || this.stopped) break;
    }
    return top;
  }
}

/**
 * The move an agent makes at draughts: alpha-beta over the game's own rules, deeper the harder the level. Below hard
 * it misreads a little and now and then plays whatever is allowed; a capture is forced by the rules either way.
 */
export function checkersMove(b: ChkBoard, level: Level, rnd: () => number): number[] | null {
  if (b.winner) return null;
  const moves = legal(b);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const skill = SKILL[level];
  if (rnd() < skill.slip) return moves[Math.floor(rnd() * moves.length) % moves.length];
  const steps = moves.map((m) => shift(b.cells, b.turn, m));
  const foe = other(b.turn);
  // a little shuffle first, so equal moves are not always answered the same way
  let order = moves.map((_, i) => ({ i, v: rnd() })).sort((p, q) => p.v - q.v);
  let scores = moves.map(() => 0);
  let lead = order[0].i;
  const search = new Search(skill.nodes);
  for (let depth = 1; depth <= skill.depth; depth++) {
    const round = moves.map(() => -Infinity);
    let alpha = -Infinity;
    let first = order[0].i;
    for (const { i } of order) {
      const s = steps[i];
      // below hard every move gets its true score, to add the misreading to; hard only needs the best one
      const floor = skill.noise ? -Infinity : alpha;
      const v = -search.best(s.cells, foe, depth - 1, -Infinity, -floor, 1, s.quiet ? b.quiet + 1 : 0);
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
    order = order.map((o) => ({ i: o.i, v: o.i === first ? -Infinity : -round[o.i] })).sort((p, q) => p.v - q.v);
    if (search.stopped || Math.abs(alpha) > WIN / 2) break;
  }
  if (!skill.noise) return moves[lead];
  let pick = lead;
  let top = -Infinity;
  moves.forEach((_, i) => {
    if (scores[i] === -Infinity) return;
    const decided = Math.abs(scores[i]) > WIN / 2;
    const v = scores[i] + (decided ? 0 : (rnd() * 2 - 1) * skill.noise);
    if (v > top) {
      top = v;
      pick = i;
    }
  });
  return moves[pick];
}
