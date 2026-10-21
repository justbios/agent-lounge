"use client";

import { useState } from "react";
import { useTr } from "@/lib/i18n";
import { Side, sideOf } from "@/lib/live/duel";
import { sfx } from "@/lib/live/sfx";
import { Ttt } from "@/lib/live/useTicTacToe";
import Finale, { Mood } from "./Finale";
import Seat, { BoardSay } from "./Seat";
import { Sprite } from "./Sprite";
import { MARKS, MARK_COLORS } from "./sprites";
import { useNewMoves } from "./useNewMoves";

const SIGN = { x: "✕", o: "◯" } as const;

const Mark = ({ side, className = "mark" }: { side: Side; className?: string }) => (
  <Sprite rows={MARKS[side]} palette={MARK_COLORS[side]} className={className} />
);

/** The middle of a square in the 3 by 3 board's own units, a line's end pushed this far past it. */
const mid = (i: number) => [(i % 3) + 0.5, Math.floor(i / 3) + 0.5];
const PAST = 0.32;

/** The stroke through three in a row, drawn from end to end in the winner's colour. */
function WinLine({ line, side }: { line: number[]; side: Side }) {
  const [x1, y1] = mid(line[0]);
  const [x2, y2] = mid(line[2]);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const [dx, dy] = [((x2 - x1) / len) * PAST, ((y2 - y1) / len) * PAST];
  const ends = { x1: x1 - dx, y1: y1 - dy, x2: x2 + dx, y2: y2 + dy, pathLength: 1 };
  return (
    <svg className="ttt-line" viewBox="0 0 3 3" aria-hidden>
      <line {...ends} stroke="#07050d" strokeWidth={0.17} />
      <line {...ends} stroke={MARK_COLORS[side].w} strokeWidth={0.09} />
    </svg>
  );
}

export default function TicTacToe({ ttt, self, note }: { ttt: Ttt; self: string; note: string | null }) {
  const t = useTr();
  const m = ttt.match!;
  const b = ttt.board!;
  const mine = sideOf(m, self) ?? "o";
  const theirs: Side = mine === "x" ? "o" : "x";
  const rival = m.x.id === self ? m.o : m.x;
  const ply = b.cells.filter(Boolean).length;
  const [opened] = useState(ply);

  useNewMoves(b, ply, (now, _, soon) => {
    sfx("move");
    if (now.winner) soon(now.winner === "draw" ? "draw" : now.winner === mine ? "win" : "lose", 260);
    else if (now.turn === mine) soon("turn", 200);
  });

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
  const end: Mood | null = b.winner ? (b.winner === "draw" ? "draw" : b.winner === mine ? "win" : "lose") : null;
  const mood = end ?? (go ? "go" : null);
  const verdict = { win: t("Перемога!", "You win!"), lose: t("Поразка", "You lose"), draw: t("Нічия", "Draw") };
  return (
    <div className="bgame ttt-game">
      <Seat name={rival.name} on={live && b.turn === theirs} won={b.winner === theirs} mark={<Mark side={theirs} />} />
      <div className={`ttt-board${go ? " go" : ""}`}>
        <div className="ttt-grid" role="grid" aria-label={t("поле хрестиків-нуликів", "tic-tac-toe board")}>
          {b.cells.map((c, i) => {
            const cls = [b.line?.includes(i) ? "win" : b.line ? "dim" : "", b.last === i ? "last" : ""]
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
        {b.line && b.winner && b.winner !== "draw" && <WinLine line={b.line} side={b.winner} />}
        {end && ply !== opened && (
          <Finale mood={end} text={verdict[end]} />
        )}
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
