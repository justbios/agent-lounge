import { COLS, FourBoard, ROWS } from "../four";
import type { Level } from "../solo";

const CELLS = COLS * ROWS;
const WIN = 100000;
/** the middle columns first: they are in the most lines, so the search cuts off sooner */
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** every four cells in a straight line on the board, four numbers to a line */
const WINDOWS: number[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    for (const [dr, dc] of DIRS) {
      const er = r + 3 * dr;
      const ec = c + 3 * dc;
      if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
      for (let k = 0; k < 4; k++) WINDOWS.push((r + k * dr) * COLS + c + k * dc);
    }
  }
}
/** what one, two and three discs alone in a window are worth */
const WORTH = [0, 1, 4, 18];

interface Skill {
  depth: number;
  /** positions looked at before the search stops going deeper */
  nodes: number;
  /** how far off its reading of a move can be, in the search's own points */
  noise: number;
  /** how often it just drops a disc somewhere */
  slip: number;
  /** how often it sees a four it can finish, and a four of the other side's to stop */
  win: number;
  block: number;
}

const SKILL: Record<Level, Skill> = {
  easy: { depth: 2, nodes: 2000, noise: 7, slip: 0.25, win: 0.85, block: 0.5 },
  normal: { depth: 4, nodes: 30000, noise: 2.5, slip: 0.04, win: 1, block: 0.97 },
  hard: { depth: 14, nodes: 250000, noise: 0.4, slip: 0, win: 1, block: 1 },
};

class Search {
  readonly g = new Int8Array(CELLS);
  /** the row a disc dropped into each column lands in; -1 when it is full */
  readonly top = new Int8Array(COLS);
  filled = 0;
  nodes = 0;
  stopped = false;

  constructor(
    b: FourBoard,
    readonly budget: number,
  ) {
    this.top.fill(ROWS - 1);
    b.cells.forEach((c, i) => {
      if (!c) return;
      this.g[i] = c === b.turn ? 1 : -1;
      this.filled += 1;
      const col = i % COLS;
      this.top[col] = Math.min(this.top[col], Math.floor(i / COLS) - 1);
    });
  }

  /** how many of `who` stand in a row from (r, c) on, going (dr, dc) */
  private run(r: number, c: number, dr: number, dc: number, who: number): number {
    const g = this.g;
    let n = 0;
    r += dr;
    c += dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && g[r * COLS + c] === who) {
      n += 1;
      r += dr;
      c += dc;
    }
    return n;
  }

  /** whether the disc in `cell` finished a four */
  wins(cell: number, who: number): boolean {
    const r = (cell / COLS) | 0;
    const c = cell % COLS;
    return (
      this.run(r, c, 1, 0, who) >= 3 ||
      this.run(r, c, 0, 1, who) + this.run(r, c, 0, -1, who) >= 3 ||
      this.run(r, c, 1, 1, who) + this.run(r, c, -1, -1, who) >= 3 ||
      this.run(r, c, 1, -1, who) + this.run(r, c, -1, 1, who) >= 3
    );
  }

  /** the board as `who` sees it: the lines still open to each side, and the middle column */
  weigh(who: number): number {
    const g = this.g;
    let v = 0;
    for (let w = 0; w < WINDOWS.length; w += 4) {
      let mine = 0;
      let theirs = 0;
      for (let k = 0; k < 4; k++) {
        const d = g[WINDOWS[w + k]];
        if (d === who) mine += 1;
        else if (d) theirs += 1;
      }
      if (mine && !theirs) v += WORTH[mine];
      else if (theirs && !mine) v -= WORTH[theirs];
    }
    for (let r = 0; r < ROWS; r++) v += g[r * COLS + 3] * who * 2;
    return v;
  }

  drop(col: number, who: number): number {
    const cell = this.top[col] * COLS + col;
    this.g[cell] = who;
    this.top[col] -= 1;
    this.filled += 1;
    return cell;
  }

  lift(col: number) {
    this.top[col] += 1;
    this.g[this.top[col] * COLS + col] = 0;
    this.filled -= 1;
  }

  /** the best `who` can get, looking `depth` discs ahead */
  best(depth: number, alpha: number, beta: number, who: number, ply: number): number {
    if (this.filled === CELLS) return 0;
    if (depth <= 0) return this.weigh(who);
    if (this.nodes > this.budget) {
      this.stopped = true;
      return this.weigh(who);
    }
    let top = -Infinity;
    for (let k = 0; k < COLS; k++) {
      const col = ORDER[k];
      if (this.top[col] < 0) continue;
      this.nodes += 1;
      const cell = this.drop(col, who);
      const v = this.wins(cell, who) ? WIN - ply : -this.best(depth - 1, -beta, -alpha, -who, ply + 1);
      this.lift(col);
      if (v > top) top = v;
      if (top > alpha) alpha = top;
      if (alpha >= beta || this.stopped) break;
    }
    return top;
  }
}

/**
 * The column an agent drops its disc into: the search looks further ahead the harder the level, and below hard it
 * misreads a little and now and then drops one anywhere.
 */
export function fourMove(b: FourBoard, level: Level, rnd: () => number): number | null {
  if (b.winner) return null;
  const skill = SKILL[level];
  const s = new Search(b, skill.nodes);
  const cols = ORDER.filter((c) => s.top[c] >= 0);
  if (!cols.length) return null;
  const any = () => cols[Math.floor(rnd() * cols.length) % cols.length];
  const ends = (who: number) =>
    cols.filter((c) => {
      const cell = s.drop(c, who);
      const won = s.wins(cell, who);
      s.lift(c);
      return won;
    });
  const winning = ends(1);
  if (winning.length && rnd() < skill.win) return winning[0];
  const blocks = ends(-1);
  if (blocks.length && rnd() < skill.block) return blocks[0];
  if (rnd() < skill.slip) return any();

  let scores = cols.map(() => 0);
  for (let depth = 1; depth <= Math.min(skill.depth, CELLS - s.filled); depth++) {
    const round = cols.map((c) => {
      const cell = s.drop(c, 1);
      const v = s.wins(cell, 1) ? WIN : -s.best(depth - 1, -Infinity, Infinity, -1, 1);
      s.lift(c);
      return v;
    });
    // a search out of budget keeps the last depth it finished
    if (s.stopped && depth > 1) break;
    scores = round;
    // deeper changes nothing once the game is decided
    if (s.stopped || round.some((v) => v > WIN / 2) || round.every((v) => v < -WIN / 2)) break;
  }
  let best = cols[0];
  let top = -Infinity;
  cols.forEach((c, i) => {
    const decided = Math.abs(scores[i]) > WIN / 2;
    const v = scores[i] + (decided ? 0 : (rnd() * 2 - 1) * skill.noise);
    if (v > top) {
      top = v;
      best = c;
    }
  });
  return best;
}
