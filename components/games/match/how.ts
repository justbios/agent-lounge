import { ChkBoard, QUIET_DRAW } from "@/lib/live/checkers";
import type { ChessBoard } from "@/lib/live/chess";
import type { Side } from "@/lib/live/duel";
import type { FourBoard } from "@/lib/live/four";
import type { TttBoard } from "@/lib/live/ttt";
import type { Outcome } from "./table";

/** The boards of the turn-based games, each set only while its own game is the one being played. */
export interface Boards {
  ttt: TttBoard | null;
  four: FourBoard | null;
  checkers: ChkBoard | null;
  chess: ChessBoard | null;
  /** the side whose clock ran out, in a game on one */
  timeOut: Side | null;
}

type Tr = (uk: string, en: string) => string;

/** A turn-based game's winner, whichever board it is on. */
export const winnerOf = (b: Boards): Side | "draw" | null =>
  (b.chess ?? b.checkers ?? b.four ?? b.ttt)?.winner ?? null;

/** A whole move's number from the count of half-moves: both sides moving once is one move. */
const moveNo = (plies: number) => Math.max(1, Math.ceil(plies / 2));

/**
 * How a game ended, in a few words for the result card: the mate and its move, the clock, three in a row, the score
 * of a table game. `score` is this player's first; null when the game does not say.
 */
export function howOf(b: Boards, outcome: Outcome, score: readonly [number, number] | null, t: Tr): string | null {
  if (score) return t(`рахунок ${score[0]} : ${score[1]}`, `score ${score[0]} : ${score[1]}`);
  const timed = (b.chess?.end === "time" || (b.checkers && b.timeOut)) && outcome !== "drawn";
  if (timed) {
    return outcome === "won"
      ? t("у суперника скінчився час", "their clock ran out")
      : t("твій час скінчився", "your clock ran out");
  }
  if (b.chess) {
    const n = moveNo(b.chess.moves.length);
    switch (b.chess.end) {
      case "mate":
        return t(`мат на ${n}-му ході`, `checkmate on move ${n}`);
      case "stalemate":
        return t("пат: ходити нікуди", "stalemate: no move to make");
      case "fifty":
        return t("50 ходів без взяття й ходу пішака", "50 moves with no capture or pawn move");
      case "material":
        return t("нічим поставити мат", "not enough left to mate");
      case "repeat":
        return t("позиція втретє та сама", "the same position a third time");
      default:
        return null;
    }
  }
  if (b.checkers) {
    if (outcome === "drawn") {
      return t(`${QUIET_DRAW} ходів дамками без взяття`, `${QUIET_DRAW} king moves with nothing taken`);
    }
    const loser = b.checkers.winner === "x" ? "o" : "x";
    const left = b.checkers.cells.filter((p) => p.toLowerCase() === loser).length;
    if (!left) {
      return outcome === "won"
        ? t("усі шашки суперника побито", "every one of their men is taken")
        : t("усі твої шашки побито", "every one of your men is taken");
    }
    return outcome === "won"
      ? t("у суперника не лишилося ходів", "they have no move left")
      : t("у тебе не лишилося ходів", "you have no move left");
  }
  if (b.four) {
    if (outcome === "drawn") return t("поле заповнене", "the board is full");
    const n = moveNo(b.four.moves.length);
    return t(`чотири в ряд на ${n}-му ході`, `four in a row on move ${n}`);
  }
  if (b.ttt) return outcome === "drawn" ? t("поле заповнене", "the board is full") : t("три в ряд", "three in a row");
  return null;
}
