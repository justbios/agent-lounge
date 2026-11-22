import type { Side } from "../duel";
import type { Level } from "../solo";
import type { TttBoard } from "../ttt";

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

type Cells = (Side | null)[];

const wins = (c: Cells, s: Side) => LINES.some(([p, q, r]) => c[p] === s && c[q] === s && c[r] === s);
const free = (c: Cells) => c.flatMap((v, i) => (v ? [] : [i]));
const other = (s: Side): Side => (s === "x" ? "o" : "x");

/** every position's worth, worked out once: there are only a few thousand */
const known = new Map<string, number>();

/** What the side to move gets out of the position with perfect play: above 0 a win, 0 a draw; sooner is better. */
function value(c: Cells, turn: Side): number {
  const cells = free(c);
  if (wins(c, other(turn))) return -(1 + cells.length);
  if (!cells.length) return 0;
  const id = c.map((v) => v ?? "-").join("") + turn;
  const hit = known.get(id);
  if (hit !== undefined) return hit;
  let best = -Infinity;
  for (const i of cells) {
    c[i] = turn;
    best = Math.max(best, -value(c, other(turn)));
    c[i] = null;
  }
  known.set(id, best);
  return best;
}

const pick = <T>(list: T[], rnd: () => number): T => list[Math.floor(rnd() * list.length) % list.length];

/** how often each level sees a win it can take, a line it must block, and otherwise plays the best square */
const SKILL: Record<Level, { win: number; block: number; best: number }> = {
  easy: { win: 0.75, block: 0.45, best: 0.2 },
  normal: { win: 1, block: 0.9, best: 0.62 },
  hard: { win: 1, block: 1, best: 1 },
};

/**
 * The square an agent marks: never beaten on hard; below that it sometimes misses a line to block or simply plays a
 * square it likes, which is where a person gets their chance.
 */
export function tttMove(b: TttBoard, level: Level, rnd: () => number): number | null {
  const c = [...b.cells];
  const me = b.turn;
  const cells = free(c);
  if (!cells.length || b.winner) return null;
  const skill = SKILL[level];
  const ends = (s: Side) =>
    cells.filter((i) => {
      c[i] = s;
      const won = wins(c, s);
      c[i] = null;
      return won;
    });
  const winning = ends(me);
  if (winning.length && rnd() < skill.win) return pick(winning, rnd);
  const blocks = ends(other(me));
  if (blocks.length && rnd() < skill.block) return pick(blocks, rnd);
  if (rnd() >= skill.best) return pick(cells, rnd);
  let top = -Infinity;
  let best: number[] = [];
  for (const i of cells) {
    c[i] = me;
    const v = -value(c, other(me));
    c[i] = null;
    if (v > top) {
      top = v;
      best = [i];
    } else if (v === top) best.push(i);
  }
  return pick(best, rnd);
}
