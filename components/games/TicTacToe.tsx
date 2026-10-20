"use client";

import { useTr } from "@/lib/i18n";
import { Side, sideOf } from "@/lib/live/duel";
import { Ttt } from "@/lib/live/useTicTacToe";
import Seat, { BoardSay } from "./Seat";
import { Sprite } from "./Sprite";
import { MARKS, MARK_COLORS } from "./sprites";

const SIGN = { x: "✕", o: "◯" } as const;

const Mark = ({ side, className = "mark" }: { side: Side; className?: string }) => (
  <Sprite rows={MARKS[side]} palette={MARK_COLORS[side]} className={className} />
);

export default function TicTacToe({ ttt, self, note }: { ttt: Ttt; self: string; note: string | null }) {
  const t = useTr();
  const m = ttt.match!;
  const b = ttt.board!;
  const mine = sideOf(m, self) ?? "o";
  const theirs: Side = mine === "x" ? "o" : "x";
  const rival = m.x.id === self ? m.o : m.x;
  const status =
    b.winner === "draw"
      ? t("нічия", "draw")
      : b.winner
        ? b.winner === mine
          ? t("перемога твоя!", "you win!")
          : t(`перемога: ${rival.name}`, `${rival.name} wins`)
        : (note ?? (b.turn === mine ? t("твій хід", "your move") : t(`ходить ${rival.name}`, `${rival.name}’s move`)));
  const live = !b.winner && !note;
  const go = live && b.turn === mine;
  const mood = b.winner ? (b.winner === "draw" ? "draw" : b.winner === mine ? "win" : "lose") : go ? "go" : null;
  return (
    <div className="bgame ttt-game">
      <Seat name={rival.name} on={live && b.turn === theirs} won={b.winner === theirs} mark={<Mark side={theirs} />} />
      <div className="ttt-grid" role="grid" aria-label={t("поле хрестиків-нуликів", "tic-tac-toe board")}>
        {b.cells.map((c, i) => {
          const cls = [
            b.line?.includes(i) ? "win" : b.line ? "dim" : "",
            b.last === i ? "last" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={i}
              className={cls}
              disabled={!go || !!c}
              onClick={() => ttt.move(i)}
              aria-label={c ? SIGN[c] : t(`клітинка ${i + 1}`, `square ${i + 1}`)}
            >
              {c ? <Mark side={c} /> : go && <Mark side={mine} className="mark ghost" />}
            </button>
          );
        })}
      </div>
      <Seat
        name={m.x.id === self ? m.x.name : m.o.name}
        you
        on={go}
        won={b.winner === mine}
        mark={<Mark side={mine} />}
      />
      <BoardSay text={status} mood={mood} />
    </div>
  );
}
