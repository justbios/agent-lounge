import type { ChkBoard } from "../checkers";
import type { ChessBoard, Move } from "../chess";
import type { FourBoard } from "../four";
import { BoardKind, Level, dice } from "../solo";
import type { TttBoard } from "../ttt";
import { checkersMove } from "./checkers";
import { chessMove } from "./chess";
import { fourMove } from "./four";
import { tttMove } from "./ttt";

/** One move for an agent to find: the game, its board as the rules keep it, the level, and what to seed chance with. */
export type Job =
  | { kind: "ttt"; board: TttBoard; level: Level; seed: number }
  | { kind: "four"; board: FourBoard; level: Level; seed: number }
  | { kind: "checkers"; board: ChkBoard; level: Level; seed: number }
  | { kind: "chess"; board: ChessBoard; level: Level; seed: number };

/** a square, a column, a path of squares, or a chess move: whatever that game's `move` takes */
export type BoardMove = number | number[] | Move;

export const BOARD_KINDS: readonly BoardKind[] = ["ttt", "four", "checkers", "chess"];

/** The agent's move on a board, or null when there is none to make. The same job always gives the same move. */
export function pickMove(job: Job): BoardMove | null {
  const rnd = dice(job.seed);
  switch (job.kind) {
    case "ttt":
      return tttMove(job.board, job.level, rnd);
    case "four":
      return fourMove(job.board, job.level, rnd);
    case "checkers":
      return checkersMove(job.board, job.level, rnd);
    case "chess":
      return chessMove(job.board, job.level, rnd);
  }
}
